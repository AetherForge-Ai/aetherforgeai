import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { allPaidFeatureLines, paidFeatureSweep, PUBLIC_PAID_PLAN_KEYS, ruleFor } from "@/lib/paid-features";
import { fixture500Snapshot } from "@/lib/fixture-500";

const read = (p: string) => readFileSync(p, "utf8");

describe("b32 L-4: each paid feature on /pricing has a gate and the gate grants it", () => {
  it("every public paid feature line maps to a rule", () => {
    const unmapped = allPaidFeatureLines().filter((line) => !ruleFor(line));
    expect(unmapped).toEqual([]);
  });
  it.each(PUBLIC_PAID_PLAN_KEYS)("%s: every line is granted by the code", (key) => {
    const rows = paidFeatureSweep(key);
    expect(rows.length).toBeGreaterThan(3);
    expect(rows.filter((r) => !r.ok)).toEqual([]);
  });
  it("Starter is one bot, 25 holdings, 15 reports, 100 queries; Pro is both bots, 75, unlimited reports, 500", () => {
    const starter = Object.fromEntries(paidFeatureSweep("starter_monthly").map((r) => [r.feature, r.granted]));
    expect(starter["One of Stox or Koins"]).toBe("bot access single");
    expect(starter["Up to 25 holdings"]).toBe("25 holdings");
    expect(starter["15 AI research reports per month"]).toBe("15 reports/month");
    expect(starter["100 Market Assistant queries per month"]).toBe("100 queries/month");
    expect(starter["Basic Headmaster"]).toBe("headmaster basic");
    const pro = Object.fromEntries(paidFeatureSweep("pro_monthly").map((r) => [r.feature, r.granted]));
    expect(pro["Stox and Koins"]).toBe("bot access both");
    expect(pro["Up to 75 holdings"]).toBe("75 holdings");
    expect(pro["500 Market Assistant queries per month"]).toBe("500 queries/month");
    expect(pro["Risk & stress testing"]).toBe("headmaster full");
  });
  it("the allow-listed sweep page is gated like the other test hooks", () => {
    const page = read("src/app/test-hooks/paid-features/page.tsx");
    expect(page).toMatch(/currentUserMayUseTestHooks\(\)\)\) notFound\(\)/);
    expect(page).toMatch(/data-paid-feature/);
  });
});

describe("b32 H-4: 500-row ledger at /dashboard/transactions, quota within 1 s", () => {
  it("the fixture has 500 ledger rows and no Math.random", () => {
    expect(fixture500Snapshot().ledger.length).toBe(500);
    expect(read("src/lib/fixture-500.ts")).not.toMatch(/Math\.random/);
  });
  it("/dashboard/transactions?fixture=500 renders the fixture only for allow-listed accounts", () => {
    const page = read("src/app/dashboard/transactions/page.tsx");
    expect(page).toMatch(/fixture === "500"/);
    expect(page).toMatch(/currentUserMayUseTestHooks\(\)/);
    expect(page).toMatch(/permanentRedirect\(dashboardRedirectHref/);
  });
  it("the quota read on the 500-row page is one bounded read under 1 s", () => {
    expect(read("src/components/dashboard/Fixture500Page.tsx")).toMatch(/readReportQuota\(900, 1\)/);
    expect(read("src/lib/dashboard-quota.server.ts")).toMatch(/attempts = 2/);
  });
  it("the 3-run LCP/CLS harness checks LCP < 2.5 s and CLS < 0.1", () => {
    const h = read("qa/local-harness/h4-500-lcp.cjs");
    expect(h).toMatch(/RUNS = 3/);
    expect(h).toMatch(/2500/);
    expect(h).toMatch(/0\.1/);
  });
});
