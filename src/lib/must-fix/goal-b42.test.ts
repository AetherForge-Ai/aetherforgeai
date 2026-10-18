// pull-check:v3-goal-b42-2026-10-19
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SIGN_OUT_COOKIE, clearSignOutMarkerHeader, hasSignOutMarker } from "@/lib/sign-out-marker";
import { heldTickersFromRows } from "@/components/import/PasteTradesBox";

const read = (p: string) => readFileSync(p, "utf8");

describe("b42 P1: Sign out cannot be overtaken (af_so marker, set before any request)", () => {
  it("reads the marker from a Cookie header or a getter", () => {
    expect(SIGN_OUT_COOKIE).toBe("af_so");
    expect(hasSignOutMarker("a=1; af_so=1760000000000; b=2")).toBe(true);
    expect(hasSignOutMarker("a=1; af_so=; b=2")).toBe(false);
    expect(hasSignOutMarker("xaf_so=1")).toBe(false);
    expect(hasSignOutMarker((n) => (n === "af_so" ? "1" : undefined))).toBe(true);
    expect(clearSignOutMarkerHeader()).toMatch(/^af_so=; Path=\/; Max-Age=0/);
  });

  it("the click sets the marker synchronously before the logout POST", () => {
    const so = read("src/lib/sign-out.ts");
    expect(so.indexOf("markSigningOut();")).toBeGreaterThan(0);
    expect(so.indexOf("markSigningOut();")).toBeLessThan(so.indexOf('fetch("/api/session/logout"'));
    expect(read("src/app/logout/page.tsx")).toMatch(/markSigningOut\(\);\s*try \{\s*const res = await fetch\("\/api\/session\/logout"/);
  });

  it("middleware treats a marked request as signed out (307 + no-store, account APIs null/401)", () => {
    const mw = read("src/middleware.ts");
    expect(mw).toMatch(/requestHasSessionToken\(\(name\) => request\.cookies\.get\(name\)\?\.value\) && !hasSignOutMarker\(/);
    // A late reply to a marked request never expires a session a fresh sign-in just set.
    expect(mw).toMatch(/clearAnonymousAuthCookies\(response, pathname, request\.method, signedIn \|\| hasToken\)/);
  });

  it("the server revokes a marked or signed-out token everywhere and never re-issues af_ls for it", () => {
    const s = read("src/lib/session.ts");
    expect(s).toMatch(/if \(hasSignOutMarker\(cookieHeader\)\) \{[\s\S]{0,120}await revokeTokenEverywhere\(ctx, token\);/);
    expect(s).toMatch(/ctx\.internalAdapter\.deleteSession\(token\)/);
    expect(s).toMatch(/if \(hasSignOutMarker\(cookieHeader\) \|\| \(await isSessionTokenRevoked\(token, 300\)\)\) return null;/);
    expect(s.indexOf("hasSignOutMarker(cookieHeader)")).toBeLessThan(s.indexOf("verifyLastGoodSession(ctx.secret"));
    expect(read("src/app/api/session/logout/route.ts")).toMatch(/await revokeTokenEverywhere\(ctx, token\)/);
  });

  it("only a response issuing a new session token clears the marker", () => {
    const r = read("src/app/api/auth/[...all]/route.ts");
    expect(r).toMatch(/async function clearMarkerOnSignIn/);
    expect(r).toMatch(/get-session\|sign-out/);
    expect(r).toMatch(/clearMarkerOnSignIn\(await handler\.POST\(req\), pathname\)/);
  });

  it("account pages use a fresh server session check, and the client leaves at once on the marker", () => {
    for (const p of ["settings", "account", "profile", "onboarding", "import"]) {
      expect(read(`src/app/${p}/page.tsx`)).toMatch(/getCurrentUser\(\{ fresh: true \}\)/);
    }
    expect(read("src/lib/session.ts")).toMatch(/if \(!opts\.fresh && cached/);
    expect(read("src/components/auth/RedirectSignedOut.tsx")).toMatch(/af_so=/);
  });
});

describe("b42 P3: a sell you don't hold is flagged on review without a cached book", () => {
  it("builds the held set from /api/stocks rows", () => {
    const held = heldTickersFromRows([{ ticker: "fph.nz", shares: 10 }, { ticker: "AIR.NZ", shares: 0 }, { symbol: "BTC", quantity: 0.1 }]);
    expect([...held].sort()).toEqual(["BTC", "FPH.NZ"]);
  });
  it("fetches holdings when the book is not cached", () => {
    const box = read("src/components/import/PasteTradesBox.tsx");
    expect(box).toMatch(/api\s*\.get<Array<Record<string, unknown>>>\("\/api\/stocks"\)/);
    expect(box).toMatch(/const held = bookHeld \?\? fetchedHeld;/);
  });
});
