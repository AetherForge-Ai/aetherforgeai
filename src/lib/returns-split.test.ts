import { describe, expect, it } from "vitest";
import { computeSummary, type Stock } from "@/lib/portfolio";
import { splitReturns } from "@/lib/returns-split";

describe("return split adds up to the P/L", () => {
  it("puts the 4-decimal FX rounding gap in Other", () => {
    const fx = { NZD: 1, USD: 1.7, AUD: 1.23456 };
    const stock: Stock = {
      _id: "1",
      ticker: "BHP.AX",
      asset_type: "stock",
      shares: 10000,
      purchase_price: 10,
      current_price: 11,
      purchase_date: "2020-01-15",
    };
    const summary = computeSummary([stock], { baseCurrency: "NZD", fxToNZD: fx });
    const split = splitReturns(
      [
        {
          quantity: 10000,
          costPrice: 10,
          markPrice: 11,
          currency: "AUD",
          fxNow: 1.23456,
          purchaseDate: "2020-01-15",
        },
      ],
      0,
      summary.totalGain
    );
    expect(split.incomeNzd).toBe(0);
    expect(split.currencyEffectNzd).toBe(0);
    expect(split.otherNzd).not.toBe(0);
    expect(split.totalNzd).toBe(summary.totalGain);
    expect(split.capitalGainNzd + split.incomeNzd + split.currencyEffectNzd + split.otherNzd).toBe(summary.totalGain);
  });

  it("explains a gap between one-step capital gain and the reported P/L", () => {
    const split = splitReturns(
      [{ quantity: 1, costPrice: 100, markPrice: 277.71, currency: "NZD", fxNow: 1 }],
      0,
      201.83
    );
    expect(split.capitalGainNzd).toBe(177.71);
    expect(split.incomeNzd).toBe(0);
    expect(split.currencyEffectNzd).toBe(0);
    expect(split.otherNzd).toBe(24.12);
    expect(split.totalNzd).toBe(201.83);
  });

  it("leaves Other at zero for an NZD position the P/L already matches", () => {
    const split = splitReturns(
      [{ quantity: 10, costPrice: 10, markPrice: 20, currency: "NZD", fxNow: 1, purchaseDate: "2020-01-15" }],
      0,
      100
    );
    expect(split.capitalGainNzd).toBe(100);
    expect(split.otherNzd).toBe(0);
    expect(split.totalNzd).toBe(100);
  });
});
