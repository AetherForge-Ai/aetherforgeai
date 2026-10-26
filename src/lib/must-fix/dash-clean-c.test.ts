import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

describe("DASH-CLEAN PR C: header tap targets and lazy tab panels", () => {
  it("gives header controls 44px on mobile", () => {
    const nav = read("src/components/TopNav.tsx");
    expect(nav).toContain('className="size-11 lg:hidden" aria-label="Open menu"');
    expect(nav).toContain("flex min-h-11 items-center gap-2 rounded-full");
    expect(read("src/components/AnalyticsNotice.tsx")).toContain('"min-h-11 min-w-[7.5rem]');
  });

  it("loads the ledger, income panel and detail drawer on demand", () => {
    const calc = read("src/components/dashboard/DashboardCalculator.tsx");
    expect(calc).toContain('dynamic(() => import("@/components/dashboard/TransactionsTab")');
    expect(calc).toContain('dynamic(() => import("@/components/dashboard/IncomeTaxPanel")');
    expect(calc).toContain('dynamic(() => import("@/components/dashboard/HoldingDetailDrawer")');
  });

  it("keeps the signed-in dashboard out of search on purpose", () => {
    expect(read("src/app/robots.ts")).toContain('"/dashboard"');
  });
});
