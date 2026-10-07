import { describe, expect, it } from "vitest";
import { planSellFeeBackfill, SELL_FEE_BACKFILL_MARK } from "@/lib/sell-fee-backfill";

describe("sell fee backfill", () => {
  it("leaves a zero-fee sell alone, including a US share, crypto, and a metal", () => {
    expect(
      planSellFeeBackfill({
        _id: "tx-clw",
        type: "sell",
        ticker: "CLW",
        asset_type: "stock",
        quantity: 10,
        price: 4.2,
        fees: 0,
        fx_rate: 1.7,
        cash_nzd: 71.4,
        total: 71.4,
        realized_pnl: 12,
      })
    ).toBeNull();
    expect(
      planSellFeeBackfill({
        _id: "tx-pepe",
        type: "sell",
        ticker: "PEPE",
        asset_type: "crypto",
        quantity: 1000,
        price: 0.004,
      })
    ).toBeNull();
    expect(
      planSellFeeBackfill({
        _id: "tx-gold",
        type: "sell",
        ticker: "GOLD",
        asset_type: "metal",
        quantity: 1,
        price: 4000,
        fees: 0,
      })
    ).toBeNull();
  });

  it("skips sells that already booked a fee or were backfilled", () => {
    expect(
      planSellFeeBackfill({
        _id: "a",
        type: "sell",
        ticker: "CLW",
        quantity: 1,
        price: 4,
        fees: 3,
      })
    ).toBeNull();
    expect(
      planSellFeeBackfill({
        _id: "b",
        type: "sell",
        ticker: "CLW",
        quantity: 1,
        price: 4,
        fees: 0,
        notes: `partial ${SELL_FEE_BACKFILL_MARK}`,
      })
    ).toBeNull();
    expect(
      planSellFeeBackfill({
        _id: "c",
        type: "buy",
        ticker: "CLW",
        quantity: 1,
        price: 4,
        fees: 0,
      })
    ).toBeNull();
  });
});
