import { describe, expect, it } from "vitest";
import { cvForHolding, fdrForHolding, fifPortfolioIncome, quickSaleAdjustment, rwtOnCashDividend, rwtOnNonCashDividend } from "@/lib/nz-tax-calc";

/**
 * b51 P0: every expectation below is an Inland Revenue worked example, to the cent.
 *  - IR461 "Guide to foreign investment funds and the fair dividend rate", April 2026
 *    https://www.ird.govt.nz/-/media/project/ir/home/documents/forms-and-guides/ir400---ir499/ir461/ir461.pdf
 *  - IR284 "Resident withholding tax on dividends", October 2025
 *    https://www.ird.govt.nz/-/media/project/ir/home/documents/forms-and-guides/ir200---ir299/ir284/ir284.pdf
 */
describe("IR461 p.15 — Bill Murphy: FDR vs CV, portfolio CV loss reduced to zero", () => {
  const book = [
    { openingNzd: 100_000, closingNzd: 102_000 }, // Company A: FDR $5,000, CV $2,000
    { openingNzd: 100_000, closingNzd: 110_000 }, // Company B: FDR $5,000, CV $10,000
    { openingNzd: 100_000, closingNzd: 80_000 }, //  Company C: FDR $5,000, CV −$20,000
  ];
  it("per company", () => {
    expect(book.map(fdrForHolding)).toEqual([5_000, 5_000, 5_000]);
    expect(book.map(cvForHolding)).toEqual([2_000, 10_000, -20_000]);
  });
  it("totals: FDR $15,000; CV −$8,000 reduced to 0; the lower is CV at $0", () => {
    expect(fifPortfolioIncome(book)).toEqual({ fdrNzd: 15_000, cvNzd: -8_000, cvReturnableNzd: 0, lowerNzd: 0, lowerMethod: "CV" });
  });
});

describe("IR461 p.16 — Company A: quick sale adjustment", () => {
  const events = [
    { kind: "buy" as const, shares: 5_000, amountNzd: 110_000 }, // 1 October
    { kind: "sell" as const, shares: 4_000, amountNzd: 100_000 }, // 1 December
    { kind: "buy" as const, shares: 2_000, amountNzd: 44_000 }, //  23 December
  ];
  it("peak holding differential 2,000; average cost $22; peak amount $2,200; actual gain $12,000; QSA $2,200", () => {
    expect(quickSaleAdjustment(10_000, events)).toEqual({
      peakHoldingDifferential: 2_000,
      averageCostNzd: 22,
      peakHoldingAmountNzd: 2_200,
      actualGainNzd: 12_000,
      quickSaleAdjustmentNzd: 2_200,
    });
  });
  it("total FIF income 5% × $200,000 + $2,200 = $12,200", () => {
    const qsa = quickSaleAdjustment(10_000, events).quickSaleAdjustmentNzd;
    expect(fdrForHolding({ openingNzd: 200_000, quickSaleNzd: qsa })).toBe(12_200);
  });
  it("no quick sale without both a purchase and a disposal in the year", () => {
    expect(quickSaleAdjustment(10_000, [{ kind: "buy", shares: 1_000, amountNzd: 20_000 }]).quickSaleAdjustmentNzd).toBe(0);
    expect(quickSaleAdjustment(10_000, [{ kind: "sell", shares: 1_000, amountNzd: 20_000 }]).quickSaleAdjustmentNzd).toBe(0);
  });
});

describe("IR284 p.13 — ABC Ltd: RWT on a cash dividend", () => {
  it("$2,000 dividend, $200 imputation credit → RWT $526, gross $2,200, net $1,474", () => {
    expect(rwtOnCashDividend(2_000, 200)).toEqual({ rwtNzd: 526, grossNzd: 2_200, netNzd: 1_474 });
  });
  it("a fully imputed dividend (28/72 credit) still has RWT to pay", () => {
    expect(rwtOnCashDividend(72, 28).rwtNzd).toBe(5);
  });
});

describe("IR284 p.14 — Dollar Corp: RWT on a non-cash dividend", () => {
  it("$750 loan forgiven, $50 imputation → RWT $319.40; taxable dividend $1,119.40", () => {
    expect(rwtOnNonCashDividend(750, 50)).toEqual({ rwtNzd: 319.4, taxableNzd: 1_119.4 });
  });
});
