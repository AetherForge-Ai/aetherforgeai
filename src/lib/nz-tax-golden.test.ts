/**
 * b90 H-9: Research golden cases G01–G13 (aetherforge-plan/nz_tax_golden_cases.json, NZ-TAX-PROOF-2026-10-29.md P1).
 * Each case asserts exact cents. G11 and G13 failed before b90 (4dp FX rounding; uncapped foreign tax credit).
 */
import { describe, expect, it } from "vitest";
import { comparativeValue, fdrIncome, fifClass, fifThreshold } from "@/lib/fif-working-paper";
import { quickSaleAdjustment, rwtOnCashDividend } from "@/lib/nz-tax-calc";
import { individualFifIncome } from "@/lib/ir3/ir461";
import { buildIr3Helper } from "@/lib/ir3/ir3-helper";
import { fifoLotCostNzd, roundMoney, roundFxRate } from "@/lib/currency";
import type { FifPaper } from "@/lib/fif-working-paper";
import type { TaxableIncomeReport } from "@/lib/taxable-income";

const m = (n: number | null | undefined) => (n == null ? null : roundMoney(n).toFixed(2));
const T = 50000;

describe("NZ tax golden cases (b90 H-9)", () => {
  it("G01 under de minimis", () => {
    expect(fifThreshold(49999.99, T)).toBe("under");
  });
  it("G02 exactly NZ$50,000.00 is exempt", () => {
    expect(fifThreshold(50000, T)).toBe("at-limit");
  });
  it("G03 over for one day applies", () => {
    const peak = roundMoney(30000 + 20000.01);
    expect(m(peak)).toBe("50000.01");
    expect(fifThreshold(peak, T)).toBe("over");
  });
  it("G04 FDR basic", () => {
    expect(m(fdrIncome(120000))).toBe("6000.00");
  });
  it("G05 FDR with quick sale adjustment", () => {
    const qs = quickSaleAdjustment(1000, [
      { kind: "buy", shares: 500, amountNzd: 10200 },
      { kind: "sell", shares: 300, amountNzd: 6900 },
    ]);
    expect(m(qs.quickSaleAdjustmentNzd)).toBe("306.00");
    expect(m(fdrIncome(80000)! + qs.quickSaleAdjustmentNzd)).toBe("4306.00");
  });
  it("G06 CV portfolio loss floored at zero", () => {
    const cv = comparativeValue({ openingNzd: 100000, closingNzd: 90000, gainsNzd: 0, costsNzd: 0 })! +
      comparativeValue({ openingNzd: 60000, closingNzd: 62000, gainsNzd: 0, costsNzd: 0 })!;
    expect(m(cv)).toBe("-8000.00");
    const pick = individualFifIncome(fdrIncome(160000), cv)!;
    expect(pick.method).toBe("CV");
    expect(m(pick.incomeNzd)).toBe("0.00");
  });
  it("G07 IR461 Bill Murphy example", () => {
    const fdr = fdrIncome(300000)!;
    const cv = [[100000, 102000], [100000, 110000], [100000, 80000]].reduce(
      (s, [o, c]) => s + comparativeValue({ openingNzd: o, closingNzd: c, gainsNzd: 0, costsNzd: 0 })!, 0);
    expect(m(fdr)).toBe("15000.00");
    expect(m(cv)).toBe("-8000.00");
    const pick = individualFifIncome(fdr, cv)!;
    expect([pick.method, m(pick.incomeNzd)]).toEqual(["CV", "0.00"]);
  });
  it("G08 CV lower than FDR, dividend counted in gains", () => {
    const cv = comparativeValue({ openingNzd: 100000, closingNzd: 102000, gainsNzd: 1000, costsNzd: 0 });
    const pick = individualFifIncome(fdrIncome(100000), cv)!;
    expect([pick.method, m(pick.incomeNzd)]).toEqual(["CV", "3000.00"]);
  });
  it("G09 ASX-exempt share excluded from threshold", () => {
    expect(fifClass("BHP.AX", "stock")).toBe("australian");
    expect(fifClass("AAPL", "stock")).toBe("attributable");
    const rows = [{ t: "BHP.AX", cost: 70000 }, { t: "AAPL", cost: 30000 }];
    const peak = rows.filter((r) => fifClass(r.t, "stock") === "attributable").reduce((s, r) => s + r.cost, 0);
    expect(m(peak)).toBe("30000.00");
    expect(fifThreshold(peak, T)).toBe("under");
  });
  it("G10 mixed portfolio US + UK", () => {
    const fdr = fdrIncome(60000)! + fdrIncome(40000)!;
    const cvUs = comparativeValue({ openingNzd: 60000, closingNzd: 66000, gainsNzd: 900, costsNzd: 5000 })!;
    const cvUk = comparativeValue({ openingNzd: 40000, closingNzd: 37000, gainsNzd: 1200, costsNzd: 0 })!;
    expect([m(cvUs), m(cvUk)]).toEqual(["1900.00", "-1800.00"]);
    const pick = individualFifIncome(fdr, cvUs + cvUk)!;
    expect([m(fdr), pick.method, m(pick.incomeNzd)]).toEqual(["5000.00", "CV", "100.00"]);
  });
  it("G11 FX converts at the full day rate, not a 4dp-rounded rate", () => {
    expect(m(fifoLotCostNzd(1, 30000, 1.712345))).toBe("51370.35");
    expect(m(30000 * roundFxRate(1.712345))).toBe("51369.00");
  });
  it("G12 NZ cash dividend, full imputation, RWT 33%", () => {
    const r = rwtOnCashDividend(720, 280, 0.33);
    expect([m(r.grossNzd), m(r.rwtNzd), m(r.netNzd), m(280 + r.rwtNzd)]).toEqual(["1000.00", "50.00", "670.00", "330.00"]);
  });
  it("G13 foreign tax credit capped at NZ tax on FIF income", () => {
    const fif = {
      threshold: "over",
      peakCostNzd: 55000,
      thresholdNzd: T,
      attributing: [{ ticker: "AAPL", costNzd: 55000, fdrNzd: fdrIncome(12000), cvNzd: null, quickSaleNzd: 0 }],
    } as unknown as FifPaper;
    const income = {
      endingYear: 2026,
      dividends: [{ ticker: "AAPL", assetType: "stock", grossNzd: 2000, withholdingNzd: 300 }],
    } as unknown as TaxableIncomeReport;
    const ir3 = buildIr3Helper({ income, fif, marginalRate: 0.33 });
    const line = ir3.lines.find((l) => l.incomeType === "FIF income")!;
    expect(m(line.grossNzd)).toBe("600.00");
    expect(m(line.creditNzd)).toBe("198.00");
  });
});
