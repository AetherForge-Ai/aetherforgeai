import { describe, expect, it } from "vitest";
import {
  AUTH_COOKIE_NAMES,
  LIVE_SESSION_PATH,
  REFRESH_SESSION_PATH,
  accountPaintDecision,
  cookieHeaderForStableRead,
  expiredAuthCookie,
  hasSessionDataCookie,
  mayPaintNavIdentity,
  sessionFlightKey,
  anonymousAccountApi,
  requestHasSessionToken,
  shouldRecoverSession,
  stripSessionDataCookie,
} from "@/lib/session-owner";

const TOKEN = "tok-1t";
const COOKIE = `__Secure-better-auth.session_token=${TOKEN}; __Secure-better-auth.session_data=abc.sig`;

describe("session owner", () => {
  it("paints only when the live id is the page owner", () => {
    expect(accountPaintDecision("user-1t", undefined)).toBe("pending");
    expect(accountPaintDecision("user-1t", null)).toBe("signed-out");
    expect(accountPaintDecision("user-1t", "")).toBe("signed-out");
    expect(accountPaintDecision("user-1t", "user-1t")).toBe("paint");
    expect(accountPaintDecision("user-1t", "user-tt")).toBe("mismatch");
    expect(accountPaintDecision(null, "user-tt")).toBe("mismatch");
  });

  it("never paints a stale atom when it is not the live owner", () => {
    expect(mayPaintNavIdentity(undefined, "user-tt")).toBe(false);
    expect(mayPaintNavIdentity(null, "user-tt")).toBe(false);
    expect(mayPaintNavIdentity("user-1t", "user-tt")).toBe(false);
    expect(mayPaintNavIdentity("user-1t", "user-1t")).toBe(true);
  });

  it("keeps refresh, cached read, and strict read on different flight keys", () => {
    expect(sessionFlightKey(COOKIE, "refresh")).toBe(`refresh:${TOKEN}`);
    expect(sessionFlightKey(COOKIE, "read")).toBe(`read:${TOKEN}`);
    expect(sessionFlightKey(COOKIE, "strict")).toBe(`strict:${TOKEN}`);
    expect(sessionFlightKey(COOKIE, "strict-db")).toBe(`strict-db:${TOKEN}`);
    expect(sessionFlightKey("better-auth.session_token=plain", "refresh")).toBe("refresh:plain");
    expect(sessionFlightKey("", "read")).toBe("read:none");
  });

  it("strips session_data and leaves the session token", () => {
    expect(hasSessionDataCookie(COOKIE)).toBe(true);
    expect(hasSessionDataCookie(`better-auth.session_token=${TOKEN}`)).toBe(false);
    const stripped = stripSessionDataCookie(COOKIE);
    expect(stripped).toContain(`__Secure-better-auth.session_token=${TOKEN}`);
    expect(stripped).not.toContain("session_data");
    expect(stripSessionDataCookie("better-auth.session_data=only")).toBe("");
  });

  it("never rotates to recover a null probe", () => {
    expect(shouldRecoverSession({ purpose: "page" })).toBe(false);
    expect(shouldRecoverSession({ purpose: "nav", atomUserId: null })).toBe(false);
    expect(shouldRecoverSession({ purpose: "nav", atomUserId: "user-tt" })).toBe(false);
  });

  it("expires every auth cookie name with attributes the browser will honor", () => {
    expect(AUTH_COOKIE_NAMES).toEqual([
      "better-auth.session_token",
      "__Secure-better-auth.session_token",
      "better-auth.session_data",
      "__Secure-better-auth.session_data",
      "better-auth.dont_remember",
      "__Secure-better-auth.dont_remember",
    ]);
    for (const name of AUTH_COOKIE_NAMES) {
      const cookie = expiredAuthCookie(name);
      expect(cookie.value).toBe("");
      expect(cookie.options.maxAge).toBe(0);
      expect(cookie.options.path).toBe("/");
      expect(cookie.options.httpOnly).toBe(true);
      expect(cookie.options.expires.getTime()).toBe(0);
      if (name.startsWith("__Secure-")) {
        expect(cookie.options.secure).toBe(true);
        expect(cookie.options.sameSite).toBe("none");
      } else {
        expect(cookie.options.secure).toBe(false);
        expect(cookie.options.sameSite).toBe("lax");
      }
    }
  });

  it("probes identity on the stable session route, not the rotating refresh", () => {
    expect(LIVE_SESSION_PATH).toBe("/api/session");
    expect(LIVE_SESSION_PATH).not.toContain("get-session");
    expect(REFRESH_SESSION_PATH).toBe("/api/auth/get-session");
    expect(REFRESH_SESSION_PATH).not.toContain("disableRefresh");
  });

  it("drops session_data before a stable read and keeps both token names", () => {
    const mixed = [
      "better-auth.session_token=old",
      "__Secure-better-auth.session_token=new",
      "__Secure-better-auth.session_data=cached-other-book",
    ].join("; ");
    const stable = cookieHeaderForStableRead(mixed);
    expect(stable).toContain("better-auth.session_token=old");
    expect(stable).toContain("__Secure-better-auth.session_token=new");
    expect(stable).not.toContain("session_data");
    expect(hasSessionDataCookie(stable)).toBe(false);
  });

  it("treats a missing or blank session cookie as signed out", () => {
    expect(requestHasSessionToken(() => undefined)).toBe(false);
    expect(requestHasSessionToken(() => "  ")).toBe(false);
    expect(
      requestHasSessionToken((name) => (name === "__Secure-better-auth.session_token" ? "tok" : undefined))
    ).toBe(true);
  });

  it("does not let a cookie-less request read another member's book", () => {
    expect(anonymousAccountApi("/api/session", "GET")).toBe("session-null");
    expect(anonymousAccountApi("/api/auth/get-session", "GET")).toBe("auth-null");
    expect(anonymousAccountApi("/api/auth/sign-in/email", "POST")).toBeNull();
    expect(anonymousAccountApi("/api/stocks", "GET")).toBe("unauthorized");
    expect(anonymousAccountApi("/api/alerts", "GET")).toBe("unauthorized");
    expect(anonymousAccountApi("/api/transactions", "POST")).toBe("unauthorized");
    expect(anonymousAccountApi("/api/tax/dividends/export", "GET")).toBe("unauthorized");
    expect(anonymousAccountApi("/api/tax/fif", "POST")).toBe("unauthorized");
    expect(anonymousAccountApi("/api/tax/realised/export", "GET")).toBe("unauthorized");
    expect(anonymousAccountApi("/api/metals", "GET")).toBe("unauthorized");
    expect(anonymousAccountApi("/api/metals/lot-1", "DELETE")).toBe("unauthorized");
    expect(anonymousAccountApi("/api/metals/spot", "GET")).toBeNull();
    expect(anonymousAccountApi("/api/ticker", "GET")).toBeNull();
    expect(anonymousAccountApi("/api/personal-guide", "POST")).toBeNull();
    expect(anonymousAccountApi("/api/session/logout", "POST")).toBeNull();
    expect(anonymousAccountApi("/dashboard", "GET")).toBeNull();
  });
});
