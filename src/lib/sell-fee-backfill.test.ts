import { describe, expect, it } from "vitest";
import { planSellFeeBackfill, SELL_FEE_BACKFILL_MARK } from "@/lib/sell-fee-backfill";

describe("sell fee backfill", () => {
  it("plans the US$3 preset for a CLW sell that stored no fee", () => {
    const plan = planSellFeeBackfill({
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
    });
    expect(plan).toMatchObject({
      id: "tx-clw",
      ticker: "CLW",
      presetId: "us-retail",
      feeNative: 3,
    });
    expect(plan!.feeNzd).toBeCloseTo(3 * 1.7, 2);
    expect(plan!.cashDeltaNzd).toBeCloseTo(-5.1, 2);
    expect(plan!.nextCashNzd).toBeCloseTo(71.4 - 5.1, 2);
    expect(plan!.nextRealizedNzd).toBeCloseTo(12 - 5.1, 2);
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
