/**
 * G-01 (GOAL-LOCK row 36): NZ imputed, US 15% withheld and DRP dividends, CSV = page, 31 Mar / 1 Apr.
 * TEST DATA ONLY — rows 4–6 of FIXTURE-SEED-SPEC-2026-10-19 §2 (fixture-g01-dividends), not a real book.
 * Rules: IRD maximum imputation ratio 28/72 (company tax 28%); US–NZ treaty dividend withholding 15%.
 * NZ tax year runs 1 Apr – 31 Mar.
 */
import { describe, expect, it } from "vitest";
import { buildDividendRecord, dividendCsv, summariseDividends, type DividendView } from "@/lib/dividend-ledger";
import { nzTaxYearEnding } from "@/lib/nz-tax-year";

function view(id: string, when: string, ticker: string, rec: Parameters<typeof buildDividendRecord>[0]): DividendView {
  const built = buildDividendRecord(rec);
  if (!built.ok) throw new Error(built.message);
  return { id, when, ticker, assetName: ticker, assetType: "stock", parts: built.parts, cashNzd: built.parts.netCashNzd };
}

const rows = [
  view("4", "2025-12-15", "FPH.NZ", { grossNative: 22, imputationNzd: 8.56, withholdingNative: 0, drpNative: 22, currency: "NZD", fx: 1, drpShares: 0.65 }),
  view("5", "2026-03-31", "FPH.NZ", { grossNative: 20, imputationNzd: 7.78, withholdingNative: 0, drpNative: 0, currency: "NZD", fx: 1 }),
  view("6", "2026-04-01", "AAPL", { grossNative: 3, imputationNzd: 0, withholdingNative: 0.45, drpNative: 0, currency: "USD", fx: 1.8 }),
];
const byYear = (y: number) => rows.filter((r) => nzTaxYearEnding(r.when) === y);

describe("G-01 dividend fixture (test data)", () => {
  it("the imputation and withholding inputs follow the documented rules", () => {
    expect(Math.round(((22 * 28) / 72) * 100) / 100).toBe(8.56);
    expect(Math.round(((20 * 28) / 72) * 100) / 100).toBe(7.78);
    expect(Math.round(3 * 0.15 * 100) / 100).toBe(0.45);
  });
  it("31 Mar lands in 2025-26 and 1 Apr in 2026-27", () => {
    expect(nzTaxYearEnding("2026-03-31")).toBe(2026);
    expect(nzTaxYearEnding("2026-04-01")).toBe(2027);
  });
  it("2025-26: dividends NZ$42.00, imputation NZ$16.34, the DRP moves no cash", () => {
    const t = summariseDividends(byYear(2026));
    expect(t.grossNzd).toBe(42);
    expect(t.imputationNzd).toBe(16.34);
    expect(t.drpNzd).toBe(22);
    expect(t.netCashNzd).toBe(20);
    expect(rows[0].parts?.drpShares).toBe(0.65);
  });
  it("2026-27: AAPL gross NZ$5.40, withholding NZ$0.81, net NZ$4.59", () => {
    const t = summariseDividends(byYear(2027));
    expect([t.grossNzd, t.withholdingNzd, t.netCashNzd]).toEqual([5.4, 0.81, 4.59]);
  });
  it("CSV totals equal the page totals for each tax year", () => {
    for (const y of [2026, 2027]) {
      const set = byYear(y);
      const page = summariseDividends(set);
      const all = dividendCsv(set, (d) => d).trim().split("\n").slice(1).map((l) => l.split(","));
      const totalsLine = all.pop()!;
      expect(all).toHaveLength(set.length);
      const want = [page.grossNzd, page.imputationNzd, page.withholdingNzd, page.drpNzd, page.netCashNzd];
      const sum = (col: number) => Math.round(all.reduce((s, c) => s + Number(c[col] || 0), 0) * 100) / 100;
      expect([sum(5), sum(6), sum(7), sum(8), sum(9)]).toEqual(want);
      expect([5, 6, 7, 8, 9].map((c) => Number(totalsLine[c]))).toEqual(want);
    }
  });
});
