import { describe, expect, it } from "vitest";
import {
  LIVE_SESSION_PATH,
  REFRESH_SESSION_PATH,
  accountPaintDecision,
  cookieHeaderForStableRead,
  hasSessionDataCookie,
  mayPaintNavIdentity,
  sessionFlightKey,
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
});
