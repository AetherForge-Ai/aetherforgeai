import { describe, expect, it } from "vitest";
import {
  anonymousResponseMaySetAuthCookie,
  filterAnonymousAuthSetCookies,
  isAccountScopedClientUrl,
  isCacheableMarketingPath,
  isPrivateAppPath,
  isSharedCacheReplay,
} from "./private-document";

const TOKEN = "__Secure-better-auth.session_token=abc; Path=/; HttpOnly; Secure";
const THEME = "theme=dark; Path=/";

describe("private document cache policy", () => {
  it("keeps marketing pages shareable and private app shells uncacheable", () => {
    expect(isCacheableMarketingPath("/")).toBe(true);
    expect(isCacheableMarketingPath("/about")).toBe(true);
    expect(isCacheableMarketingPath("/performance")).toBe(true);
    expect(isCacheableMarketingPath("/pricing/")).toBe(true);
    expect(isCacheableMarketingPath("/dashboard")).toBe(false);
    expect(isCacheableMarketingPath("/markets")).toBe(false);
    expect(isCacheableMarketingPath("/login")).toBe(false);
    expect(isPrivateAppPath("/dashboard")).toBe(true);
    expect(isPrivateAppPath("/dashboard/stocks")).toBe(true);
    expect(isPrivateAppPath("/notifications")).toBe(true);
    expect(isPrivateAppPath("/headmaster")).toBe(true);
    expect(isPrivateAppPath("/settings")).toBe(true);
    expect(isPrivateAppPath("/about")).toBe(false);
  });

  it("drops a leaked session cookie on anonymous dashboard GETs", () => {
    expect(anonymousResponseMaySetAuthCookie("/dashboard", "GET")).toBe(false);
    expect(anonymousResponseMaySetAuthCookie("/api/auth/get-session", "GET")).toBe(false);
    expect(anonymousResponseMaySetAuthCookie("/api/auth/sign-in/email", "POST")).toBe(true);
    expect(anonymousResponseMaySetAuthCookie("/api/auth/callback/google", "GET")).toBe(true);
    expect(anonymousResponseMaySetAuthCookie("/api/session/logout", "POST")).toBe(true);
    const kept = filterAnonymousAuthSetCookies([TOKEN, THEME], "/dashboard", "GET", false);
    expect(kept).toEqual([THEME]);
    const signedIn = filterAnonymousAuthSetCookies([TOKEN], "/dashboard", "GET", true);
    expect(signedIn).toEqual([TOKEN]);
    const login = filterAnonymousAuthSetCookies([TOKEN], "/api/auth/sign-in/email", "POST", false);
    expect(login).toEqual([TOKEN]);
  });

  it("treats a CDN hit or aged account payload as unsafe to paint", () => {
    expect(isSharedCacheReplay({ get: () => null })).toBe(false);
    expect(isSharedCacheReplay({ get: (name) => (name === "cf-cache-status" ? "DYNAMIC" : null) })).toBe(false);
    expect(isSharedCacheReplay({ get: (name) => (name === "cf-cache-status" ? "HIT" : null) })).toBe(true);
    expect(isSharedCacheReplay({ get: (name) => (name === "cf-cache-status" ? "STALE" : null) })).toBe(true);
    expect(isSharedCacheReplay({ get: (name) => (name === "age" ? "12" : null) })).toBe(true);
    expect(isSharedCacheReplay({ get: (name) => (name === "age" ? "0" : null) })).toBe(false);
    expect(isSharedCacheReplay(undefined)).toBe(false);
    expect(isAccountScopedClientUrl("/api/session")).toBe(true);
    expect(isAccountScopedClientUrl("/api/stocks?x=1")).toBe(true);
    expect(isAccountScopedClientUrl("/api/transactions")).toBe(true);
    expect(isAccountScopedClientUrl("/api/ticker")).toBe(false);
    expect(isAccountScopedClientUrl("https://aetherforgeai.co.nz/api/alerts")).toBe(true);
  });
});
