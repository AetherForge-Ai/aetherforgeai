import { describe, expect, it } from "vitest";
import {
  LIVE_SESSION_PATH,
  REFRESH_SESSION_PATH,
  accountPaintDecision,
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

  it("recovers a dashboard miss, and a nav miss only when the atom has a user", () => {
    expect(shouldRecoverSession({ purpose: "page" })).toBe(true);
    expect(shouldRecoverSession({ purpose: "nav", atomUserId: null })).toBe(false);
    expect(shouldRecoverSession({ purpose: "nav", atomUserId: "user-tt" })).toBe(true);
  });

  it("probes identity without using the rotating refresh URL", () => {
    expect(LIVE_SESSION_PATH).toContain("disableCookieCache=true");
    expect(LIVE_SESSION_PATH).toContain("disableRefresh=true");
    expect(REFRESH_SESSION_PATH).toBe("/api/auth/get-session");
    expect(REFRESH_SESSION_PATH).not.toContain("disableRefresh");
  });
});
