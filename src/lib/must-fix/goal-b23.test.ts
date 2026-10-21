// pull-check:v3-goal-b23-2026-10-18
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { performanceReport, type PerformanceInput } from "@/lib/performance-math";

const read = (f: string) => readFileSync(f, "utf8");

describe("goal b23", () => {
  it("pins the build", () => expect(read("public/build-version.txt").trim()).toMatch(/^v3-(?:goal|restore)-b\d+[a-z]?-2026-10-\d\d$/));

  it("H-10 fixtures: CommSec uses a trade-date AUD rate inside the 5% band; Hatch never sells a holding it did not buy", () => {
    const commsec = read("src/lib/fixtures/broker-import/commsec.csv");
    expect(commsec).toMatch(/,AUD,1\.19\n/);
    expect(commsec).not.toMatch(/,AUD,1\.10/);
    const hatch = read("src/lib/fixtures/broker-import/hatch.csv");
    expect(hatch).not.toMatch(/SELL,TSLA/);
    expect(hatch).toMatch(/BUY,MSFT[\s\S]*SELL,MSFT/);
    expect(JSON.parse(read("src/lib/fixtures/broker-import/expected-totals.json"))["commsec.csv"].cashNzd).toBe(-1761.2);
  });

  it("historical FX uses the current frankfurter host (no 301 hop)", () => {
    expect(read("src/lib/fx.ts")).toContain("https://api.frankfurter.dev/v1/");
    expect(read("src/app/api/tickers/history/route.ts")).not.toContain("api.frankfurter.app");
  });

  it("G-02: 20-trade golden matches the LibreOffice spreadsheet within 0.01%", () => {
    const golden = JSON.parse(read("src/lib/fixtures/performance-golden.json")) as PerformanceInput;
    const sheet = JSON.parse(read("src/lib/fixtures/performance-golden.sheet.json")) as { xirr: number; twr: number; source: string };
    expect(sheet.source).toMatch(/LibreOffice/);
    const report = performanceReport(golden);
    expect(Math.abs((report.xirr.value ?? 0) - sheet.xirr) / sheet.xirr).toBeLessThan(0.0001);
    expect(Math.abs((report.twr.value ?? 0) - sheet.twr) / sheet.twr).toBeLessThan(0.0001);
    expect(report.xirr.asOf).toBeTruthy();
    expect(report.xirr.source).toBeTruthy();
  });

  it("G-02: empty and one-trade books do not throw and give no invented figure", () => {
    const empty = performanceReport({ asOf: "2026-10-18", endingNzd: 0, source: "Paper book", points: [] });
    expect(empty.xirr.value).toBeNull();
    const one = performanceReport({ asOf: "2026-10-18", endingNzd: 1000, source: "Paper book", points: [{ date: "2026-10-18", valueBeforeNzd: 0, flowNzd: 1000 }] });
    expect(one.xirr.asOf).toBe("2026-10-18");
    expect(Number.isFinite(one.xirr.value ?? 0)).toBe(true);
  });

  it("G-01 harness covers imputed, withheld, DRP and the 31 Mar / 1 Apr boundary", () => {
    const s = read("qa/local-harness/g01-dividends.mjs");
    for (const k of ["dividend_imputation_nzd", "dividend_withholding", "dividend_drp_shares", "2026-03-31", "2026-04-01", "csv(2026)", "csv(2027)", "Combined totals"]) expect(s).toContain(k);
  });

  it("wealth goal save is debounced", () => {
    const p = read("src/components/dashboard/WholeWealthPanel.tsx");
    expect(p).toMatch(/GOAL_SAVE_DEBOUNCE_MS = \d+/);
    expect(p).toContain("clearTimeout(goalTimer.current)");
  });
});

import { cashFromLedgerRows, ledgerDisplayedCash } from "@/lib/ledger-cash-lines";
describe("b23 G-01 full DRP adds no cash", () => {
  it("a breakdown dividend with 0 net cash replays as 0, not its gross quantity", () => {
    const drp = { type: "dividend", total: 0, cash_nzd: 0, quantity: 50, notes: "[DIV:g=50.00;i=0.00;w=0.00;d=50.00;fx=1.0000;ccy=NZD;ng=50.00;nw=0.00;nd=50.00;sh=1.5]" };
    expect(ledgerDisplayedCash(drp)).toBe(0);
    expect(cashFromLedgerRows([{ type: "opening_balance", total: 100 }, drp, { type: "dividend", total: 3.82, cash_nzd: 3.82, quantity: 2.6 }])).toBe(103.82);
    // An old cash-only dividend with no breakdown still falls back to its quantity.
    expect(ledgerDisplayedCash({ type: "dividend", total: 0, cash_nzd: 0, quantity: 12 })).toBe(12);
  });
});

describe("b23 G-01 DRP lot size", () => {
  it("snapshot DRP lots use the allotted shares, not the row quantity", () => {
    const s = readFileSync("src/lib/portfolio-snapshot.ts", "utf8");
    expect(s).toContain("const drpQty = Number(parts.drpShares) > 0 ? Number(parts.drpShares) : 0;");
    expect(s).not.toMatch(/const drpQty = movementQty\(row\)/);
  });
});
