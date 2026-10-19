// pull-check:v3-goal-b43-2026-10-19
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { reconcileCashOnBook, reconcileReportCash } from "@/lib/report-cash";
import { AUTH_COOKIE_NAMES } from "@/lib/session-owner";

const read = (p: string) => readFileSync(p, "utf8");

describe("b43 sign-out (Chief ruling): blocking overlay, awaited revoke, then /login", () => {
  it("the af_so marker is gone from the code, and any left-over copy is expired with the auth cookies", () => {
    expect(existsSync("src/lib/sign-out-marker.ts")).toBe(false);
    for (const f of ["src/middleware.ts", "src/lib/session.ts", "src/app/api/auth/[...all]/route.ts", "src/app/api/session/logout/route.ts"]) {
      expect(read(f)).not.toMatch(/hasSignOutMarker|markSigningOut|SIGN_OUT_COOKIE/);
    }
    expect(AUTH_COOKIE_NAMES).toContain("af_so");
  });
  it("overlay first, revoke awaited with a 5 s timeout and one retry, caches cleared, then location.replace('/login')", () => {
    const so = read("src/lib/sign-out.ts");
    expect(so).toMatch(/SIGN_OUT_POST_MS = 5_000/);
    expect(so).toMatch(/let ok = await revokeOnce\(ms\);\s*if \(!ok\) ok = await revokeOnce\(ms\);/);
    expect(so.indexOf("const release = showOverlay();")).toBeLessThan(so.indexOf("await revokeOnce(ms)"));
    expect(so.indexOf("clearClientUserState()")).toBeLessThan(so.indexOf('go(ok ? "/login"'));
    expect(so).toMatch(/document\.addEventListener\(t, swallow, true\)/);
    expect(so).not.toMatch(/"beforeunload"/); // b47 P3: dropped
  });
  it("the server revoke deletes the Totalum row under waitUntil and is awaited before the reply", () => {
    const r = read("src/app/api/session/logout/route.ts");
    expect(r).toMatch(/const work = revokeTokenEverywhere\(ctx, token\);\s*await keepAlive\(work\);\s*await work;/);
    expect(read("src/lib/session.ts")).toMatch(/ctx\.internalAdapter\.deleteSession\(token\)/);
  });
  it("the same-tab browser race test is checked in", () => {
    const t = read("qa/local-harness/signout-race.mjs");
    expect(t).toMatch(/\[0, 100, 200\]/);
    expect(t).toMatch(/page\.reload/);
    expect(t).toMatch(/#af-signing-out/);
  });
});

describe("b43 P2: a report's 'Cash on book' reads the dashboard's ledger balance", () => {
  it("replaces a stale figure and keeps the run-time figure visible with its date", () => {
    const out = reconcileCashOnBook("Cash on book NZ$100.00. Cash reserve NZ$10.00.", 0, "2026-10-18T22:00:00Z");
    expect(out).toMatch(/^Cash on book NZ\$0\.00 \(NZ\$100\.00 when this report ran on 19 Oct 2026\)\./);
    expect(reconcileCashOnBook("Cash on book: NZ$250.00", 250)).toBe("Cash on book: NZ$250.00");
    expect(reconcileCashOnBook("Cash on book is NZ$1,000", null)).toBe("Cash on book is NZ$1,000");
  });
  it("walks a stored report payload", () => {
    const r = reconcileReportCash({ executiveSummary: "Cash on book NZ$100.00", tickers: [{ note: "x" }] }, 0, null);
    expect(r.executiveSummary).toMatch(/^Cash on book NZ\$0\.00 \(NZ\$100\.00 when this report ran\)$/);
  });
  it("the dashboard passes its ledger cash and the report shows its run date", () => {
    expect(read("src/components/dashboard/PortfolioDashboard.tsx")).toMatch(/cashNzd=\{preview \? null : cashBalance\}/);
    const rc = read("src/components/dashboard/ReportCenter.tsx");
    expect(rc).toMatch(/reconcileReportCash\(report, cashNzd, reportRunAt\)/);
    expect(rc).toMatch(/Report run \{fmtDate\(reportRunAt\)\}/);
  });
});
