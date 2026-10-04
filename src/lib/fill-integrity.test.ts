import { describe, expect, it } from "vitest";
import { aucklandDateISO, checkFillSanity } from "@/lib/fill-integrity";

describe("broker import cost basis", () => {
  it("keeps a past price paid instead of comparing it with today's quote", () => {
    const result = checkFillSanity({
      ticker: "FPH",
      quantity: 100,
      fillPrice: 20,
      liveSpot: 400,
      assetType: "stock",
      priceSource: "broker_import",
      tradeDate: "2024-03-01",
    });
    expect(result.blocked).toBe(false);
    expect(result.ok).toBe(true);
  });

  it("still blocks a same-day fill that is an order of magnitude off the quote", () => {
    const result = checkFillSanity({
      ticker: "FPH",
      quantity: 100,
      fillPrice: 2,
      liveSpot: 400,
      assetType: "stock",
      priceSource: "broker_import",
      tradeDate: aucklandDateISO(),
    });
    expect(result.blocked).toBe(true);
    expect(result.code).toBe("hard_mismatch");
  });
});
