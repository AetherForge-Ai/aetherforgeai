import { describe, expect, it } from "vitest";
import {
  formatMoneyWithNzd,
  formatNzd,
  formatPriceInput,
  formatUnitPrice,
  normaliseUnitPrice,
  roundUnitPrice,
} from "@/lib/currency";
import { fmtPrice, formatAbsoluteChange, formatMarketChangePercent } from "@/lib/crypto-market";
import { planHoldingCorrection } from "@/lib/holding-correction";
import { referencePrice } from "@/lib/market";
import { netWorthNZD } from "@/lib/metal-valuation";
import { buildMovementPreview } from "@/lib/movement-preview";
import { applyPaperCashMove } from "@/lib/paper-cash";
import { computeSummary } from "@/lib/portfolio";
import { priceForBooking } from "@/lib/reviewed-book";

const PRICE = 0.00001;
const FX = 1.782;
const QTY = 1_122_334;
const RATES = { NZD: 1, AUD: 1.09, USD: FX };

describe("U1 sub-cent unit prices", () => {
  it("never shows or values 0.00001 as 0.01", () => {
    expect(referencePrice("PEPE", PRICE)).toBe(PRICE);
    expect(referencePrice("PEPE", PRICE)).not.toBe(0.01);
    expect(normaliseUnitPrice(PRICE)).toBe(PRICE);
    expect(normaliseUnitPrice(0.0000040399)).toBeCloseTo(0.0000040399, 12);
    expect(roundUnitPrice(PRICE)).toBe(PRICE);
    expect(roundUnitPrice(0.0000040399)).toBeCloseTo(0.0000040399, 12);
    expect(priceForBooking(PRICE, 0.01)).toBe(PRICE);

    expect(formatPriceInput(PRICE)).toBe("0.00001");
    expect(formatPriceInput(0.0000040399)).toContain("0.0000040399");
    expect(formatUnitPrice(PRICE, "USD")).toContain("0.00001");
    expect(formatUnitPrice(PRICE, "USD")).not.toMatch(/US\$0\.01(?!\d)/);
    expect(fmtPrice(0.00002797)).toContain("0.00002797");
    expect(fmtPrice(0.0000040399)).not.toMatch(/\$0\.01(?!\d)/);
    expect(fmtPrice(PRICE)).toContain("0.00001");
  });

  it("keeps the NZ$ unit price and rounds only the NZ$ total", () => {
    const preview = buildMovementPreview({
      type: "buy",
      date: "2026-10-10",
      asset: "PEPE",
      quantity: QTY,
      price: PRICE,
      fee: 0,
      currency: "USD",
      fxRate: FX,
      cashNzd: 100_000,
      hasAsset: true,
    });
    expect(preview.priceNative).toBe(PRICE);
    expect(preview.priceNzd).toBeGreaterThan(0);
    expect(preview.priceNzd).toBeLessThan(0.01);
    const shown = formatMoneyWithNzd(preview.priceNative, "USD", preview.priceNzd);
    expect(shown).toContain("0.00001");
    expect(shown).not.toMatch(/NZ\$0\.00(?!\d)/);
    expect(shown).not.toMatch(/US\$0\.01(?!\d)/);
    expect(formatNzd(preview.cashChangeNzd)).toMatch(/NZ\$20\.00/);
    expect(preview.cashAfterNzd).toBeCloseTo(99_980, 2);
  });

  it("values the book at the real price so net worth does not jump by NZ$20,000", () => {
    const moved = applyPaperCashMove({
      side: "buy",
      quantity: QTY,
      price: PRICE,
      fees: 0,
      currency: "USD",
      rates: RATES,
      cashNZD: 100_000,
      shares: 0,
    });
    expect(moved.ok).toBe(true);
    expect(Math.abs(moved.cashDeltaNZD)).toBeCloseTo(20, 2);
    const mark = referencePrice("PEPE", PRICE);
    const summary = computeSummary(
      [
        {
          _id: "pepe",
          ticker: "PEPE",
          asset_type: "crypto",
          shares: QTY,
          purchase_price: PRICE,
          current_price: mark,
        },
      ],
      { baseCurrency: "NZD", fxToNZD: RATES }
    );
    expect(summary.holdings[0].current_price).toBe(PRICE);
    expect(formatUnitPrice(summary.holdings[0].current_price, "USD")).toContain("0.00001");
    expect(summary.totalValue).toBeCloseTo(20, 1);
    expect(summary.totalValue).toBeLessThan(100);
    const worth = netWorthNZD({ cashNZD: moved.cashNZD, cryptoNZD: summary.totalValue });
    expect(worth).toBeCloseTo(100_000, 1);
    expect(formatNzd(worth)).toBe("NZ$100,000.00");
    expect(worth).not.toBeCloseTo(119_944.89, 0);
  });

  it("does not print a FLOKI move as +0.0000", () => {
    const price = 0.00002797;
    const move = price * 0.012;
    const abs = formatAbsoluteChange(move, price);
    expect(abs.startsWith("+")).toBe(true);
    expect(abs).not.toBe("+0.0000");
    expect(Number(abs.slice(1))).toBeGreaterThan(0);
    expect(formatMarketChangePercent(0.012)).not.toBe("0.0000");
    expect(formatMarketChangePercent(1.25)).toBe("1.25");
  });

  it("writes a sub-cent correction note without rounding the price to 0.00", () => {
    const plan = planHoldingCorrection({
      beforeShares: 1000,
      afterShares: 1000,
      beforePrice: PRICE,
      afterPrice: 0.0000040399,
    });
    expect(plan.notes).toContain("0.00001");
    expect(plan.notes).toContain("0.0000040399");
    expect(plan.notes).not.toMatch(/(^|\s)0\.00(?!\d)/);
  });
});
