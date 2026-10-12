import { describe, expect, it } from "vitest";
import { computeSummary, type Stock } from "@/lib/portfolio";
import { splitReturns } from "@/lib/returns-split";
import { fifoRemainingCostFx, fifoRemainingQtyFx } from "@/lib/tax-realised";
import type { TaxLedgerRow } from "@/lib/taxable-income";

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

  it("splits multi-lot currency on the quantity-weighted buy FX and keeps cost-weighted cost", () => {
    const rows: TaxLedgerRow[] = [
      {
        type: "buy",
        ticker: "USDLOT",
        asset_type: "stock",
        executed_at: "2026-01-15",
        quantity: 1,
        price: 10,
        currency: "USD",
        fx_rate: 1.5,
      },
      {
        type: "buy",
        ticker: "USDLOT",
        asset_type: "stock",
        executed_at: "2026-02-15",
        quantity: 1,
        price: 30,
        currency: "USD",
        fx_rate: 1.7,
      },
    ];
    const fxQty = fifoRemainingQtyFx(rows).get("USDLOT");
    const fxCost = fifoRemainingCostFx(rows).get("USDLOT");
    expect(fxQty).toBeCloseTo(1.6, 4);
    expect(fxCost).toBeCloseTo(1.65, 4);
    const split = splitReturns(
      [
        {
          quantity: 2,
          costPrice: 20,
          markPrice: 20,
          currency: "USD",
          fxAtCost: fxQty,
          costBasisFx: fxCost,
          fxNow: 1.6,
          purchaseDate: "2020-01-15",
        },
      ],
      0
    );
    expect(split.currencyEffectNzd).toBe(0);
    expect(split.capitalGainNzd).toBe(-2);
    expect(split.otherNzd).toBe(0);
    expect(split.totalNzd).toBe(-2);
  });
});
