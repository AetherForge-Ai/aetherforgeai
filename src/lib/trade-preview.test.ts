import { describe, expect, it } from "vitest";
import { buildTradePreview } from "@/lib/trade-preview";

describe("trade review preview", () => {
  it("shows a USD buy in native dollars and NZ$ and the cash left after it", () => {
    const preview = buildTradePreview({
      side: "buy",
      asset: "SOL",
      quantity: 0.4,
      price: 116.52,
      fee: 0.47,
      currency: "USD",
      cashNzd: 200,
      rates: { NZD: 1, AUD: 1.09, USD: 0.6 },
    });
    expect(preview.priceNative).toBeCloseTo(116.52, 4);
    expect(preview.priceNzd).toBeCloseTo(116.52 / 0.6, 4);
    expect(preview.feeNative).toBeCloseTo(0.47, 4);
    expect(preview.totalNative).toBeCloseTo(-(0.4 * 116.52 + 0.47), 4);
    expect(preview.totalNzd).toBeCloseTo(preview.totalNative / 0.6, 4);
    expect(preview.resultingCashNzd).toBeCloseTo(200 + preview.totalNzd, 4);
    expect(preview.resultingCashNzd).toBeLessThan(200);
  });

  it("credits NZ$ cash on a metal sell after the fee", () => {
    const preview = buildTradePreview({
      side: "sell",
      asset: "GOLD",
      quantity: 2,
      price: 4000,
      fee: 80,
      currency: "NZD",
      cashNzd: 1000,
    });
    expect(preview.priceNzd).toBe(4000);
    expect(preview.totalNative).toBe(2 * 4000 - 80);
    expect(preview.resultingCashNzd).toBe(1000 + 7920);
  });
});
