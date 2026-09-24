import { describe, expect, it } from "vitest";
import { planLedgerFxCorrection, sumCorrectionDelta } from "@/lib/fx-ledger-correction";

describe("ledger FX correction", () => {
  it("rewrites a USD buy that multiplied by the NZD→USD quote", () => {
    const native = 116.99;
    const plan = planLedgerFxCorrection({
      _id: "tx1",
      type: "buy",
      currency: "USD",
      quantity: 1,
      price: 116.52,
      fees: 0.47,
      fx_rate: 0.71,
      cash_nzd: -Math.round(native * 0.71 * 100) / 100,
    });
    expect(plan).not.toBeNull();
    expect(plan!.fxRate).toBeCloseTo(1 / 0.71, 4);
    expect(plan!.cashNzd).toBeCloseTo(-(native / 0.71), 1);
    expect(plan!.deltaCash).toBeLessThan(0);
    expect(Math.abs(plan!.cashNzd)).toBeGreaterThan(160);
  });

  it("leaves a correctly directed fill alone, including 0.4 SOL at the unit price", () => {
    const usd = 0.4 * 116.52 + 0.47;
    const rate = 1 / 0.567859;
    const cash = -Math.round(usd * rate * 100) / 100;
    expect(
      planLedgerFxCorrection({
        _id: "tx2",
        type: "buy",
        currency: "USD",
        quantity: 0.4,
        price: 116.52,
        fees: 0.47,
        fx_rate: rate,
        cash_nzd: cash,
      })
    ).toBeNull();
  });

  it("is idempotent once the row is stamped", () => {
    expect(
      planLedgerFxCorrection({
        _id: "tx3",
        type: "sell",
        currency: "USD",
        quantity: 1,
        price: 10,
        fees: 0,
        fx_rate: 0.6,
        cash_nzd: 6,
        fx_direction_corrected: "nzd-per-usd-v1",
      })
    ).toBeNull();
    expect(sumCorrectionDelta([])).toBe(0);
  });
});
