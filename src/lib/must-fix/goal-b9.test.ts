/**
 * Goal loop batch b9 (GOAL-LOCK G-07 G-08 G-09 + b8 gaps: H-9 split entry, DRP holding count).
 * pull-check:v3-goal-b9-2026-10-18
 */
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { usageMeterLabel, usageLine } from "@/lib/dashboard-rail";
import { resolveTickerLimit } from "@/lib/entitlements";
import { FREE_PLAN, planByKey } from "@/lib/plans";
import { CSV_LOCK_LABEL, csvLockAccessibleName } from "@/lib/csv-lock-label";
import { applyLedgerSplits, holdingAfterSplit, readSplit, splitInputError, splitNote } from "@/lib/stock-split";
import { drpSharesFromNotes, planLedgerReversal, replayTickerPosition, type ReversalTxn } from "@/lib/ledger-reversal";
import { withDividendNotes } from "@/lib/dividend-ledger";

const read = (p: string) => readFileSync(p, "utf8");

describe("b9 pins", () => {
  it("build version", () => {
    expect(read("public/build-version.txt").trim()).toBe("v3-b85-2026-10-28");
    expect(read("qa/PULL-CHECK-2026-10-12.md")).toContain("pull-check:v3-goal-b9-2026-10-18");
  });
});

describe("G-07 caps meter", () => {
  it('reads "12 of 25 used"', () => {
    expect(usageMeterLabel(12, 25)).toBe("12 of 25 used");
    expect(usageMeterLabel(null, 25)).toBe("— of 25 used");
    expect(usageLine(4, 10)).toBe("4 of 10");
    expect(read("src/components/dashboard/rail/DashboardRail.tsx")).toContain("usageMeterLabel(row.used, row.limit)");
  });
  it("pricing grid and enforcement agree; prices unchanged", () => {
    const grid = (key: string) => (planByKey(key)?.features || []).find((f) => /^Up to \d+ holdings$/.test(f));
    expect(FREE_PLAN.features).toContain(`Up to ${resolveTickerLimit({ subscription_plan: "free" } as never)} holdings`);
    for (const key of ["starter_monthly", "starter_yearly", "pro_monthly", "pro_yearly"]) {
      const limit = resolveTickerLimit({ subscription_plan: key } as never);
      expect(grid(key)).toBe(`Up to ${limit} holdings`);
    }
    expect(resolveTickerLimit({ subscription_plan: "starter_monthly" } as never)).toBe(25);
    expect(resolveTickerLimit({ subscription_plan: "pro_monthly" } as never)).toBe(75);
    const prices = read("src/lib/plans.ts");
    expect(prices).toMatch(/16/);
    expect(prices).toMatch(/49/);
    expect(prices).toMatch(/199/);
  });
});

describe("G-08 metals wording", () => {
  it("no 'paid plan' sentence on the metals view; Held row kept", () => {
    const alerts = read("src/components/dashboard/PriceAlerts.tsx");
    const rail = read("src/components/dashboard/rail/DashboardRail.tsx");
    const metals = read("src/components/dashboard/PreciousMetals.tsx");
    expect(alerts).not.toMatch(/paid plan/i);
    expect(rail).not.toMatch(/paid plan/i);
    expect(metals).not.toMatch(/paid plan/i);
    expect(alerts).toContain("Price alerts: Starter and above");
    expect(metals).toMatch(/Held/);
  });
});

describe("G-09 CSV lock label", () => {
  it("names the export and plan on every locked CSV button", () => {
    expect(CSV_LOCK_LABEL).toBe("CSV export: Starter and above");
    expect(csvLockAccessibleName("Transactions CSV")).toContain("CSV export: Starter and above");
    for (const f of [
      "src/components/dashboard/PortfolioDashboard.tsx",
      "src/components/dashboard/TransactionCenter.tsx",
      "src/components/tax/CsvExportButton.tsx",
    ]) {
      expect(read(f)).toContain("CSV_LOCK_LABEL");
    }
  });
});

describe("H-9 split entry", () => {
  it("records an N:1 split with NZ$ cost unchanged", () => {
    expect(holdingAfterSplit(100, 10, 2)).toEqual({ shares: 200, averageCost: 5 });
    expect(readSplit(splitNote(2, "2026-06-01"))).toEqual({ ratio: 2, date: "2026-06-01" });
    expect(splitInputError({ ticker: "AIR.NZ", ratio: 1, date: "2026-06-01", sharesHeld: 10 })).toMatch(/1:1/);
    expect(splitInputError({ ticker: "AIR.NZ", ratio: 2, date: "2026-06-01", sharesHeld: 0 })).toMatch(/don't hold/);
    expect(splitInputError({ ticker: "AIR.NZ", ratio: 2, date: "2026-06-01", sharesHeld: 10 })).toBeNull();
  });
  it("tax rows before the split are restated", () => {
    const rows = [
      { type: "buy", ticker: "AAPL", quantity: 10, price: 100, trade_date: "2026-01-10" },
      { type: "correction", ticker: "AAPL", quantity: 40, price: 25, notes: splitNote(4, "2026-03-01"), trade_date: "2026-03-01" },
      { type: "buy", ticker: "AAPL", quantity: 5, price: 30, trade_date: "2026-04-01" },
    ];
    const out = applyLedgerSplits(rows as never) as typeof rows;
    expect(out[0].quantity).toBe(40);
    expect(out[0].price).toBe(25);
    expect(out[2].quantity).toBe(5);
  });
  it("screen, API and dashboard link exist", () => {
    expect(read("src/app/dashboard/split/page.tsx")).toContain("SplitEntry");
    expect(read("src/app/api/transactions/split/route.ts")).toContain("splitNote");
    expect(read("src/components/dashboard/PortfolioDashboard.tsx")).toContain('href="/dashboard/split"');
    expect(read("src/lib/tax-book-server.ts")).toContain("applyLedgerSplits");
  });
});

describe("DRP shares update the holding count", () => {
  const notes = withDividendNotes("", {
    grossNzd: 100, imputationNzd: 0, withholdingNzd: 0, drpNzd: 50, fx: 1, currency: "NZD",
    grossNative: 100, withholdingNative: 0, drpNative: 50, netCashNzd: 50, drpShares: 3,
  } as never);
  it("tag carries sh=3", () => {
    expect(drpSharesFromNotes(notes)).toBe(3);
  });
  it("replay adds DRP shares at zero cost; reversal removes them", async () => {
    const { holdingAfterDrp } = await import("@/lib/transactions");
    expect(holdingAfterDrp(100, 2, 3)).toEqual({ shares: 103, averageCost: Math.round((200 / 103) * 1e6) / 1e6 });
    const buy: ReversalTxn = { _id: "b", type: "buy", ticker: "FPH.NZ", quantity: 100, price: 2, executed_at: "2026-01-01" };
    const div: ReversalTxn = { _id: "d", type: "dividend", ticker: "FPH.NZ", quantity: 100, price: 1, notes, executed_at: "2026-02-01", cash_nzd: 50 };
    expect(replayTickerPosition([buy, div], "FPH.NZ", "stock")?.shares).toBe(103);
    const plan = planLedgerReversal("u", div, [buy, div], { shares: 103, averageCost: 200 / 103 });
    expect(plan.holdingAfter?.shares).toBe(100);
    expect(plan.holdingAfter?.averageCost).toBe(2);
    expect(plan.holdingAction).toBe("update");
  });
});
