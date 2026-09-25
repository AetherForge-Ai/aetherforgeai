import { describe, expect, it } from "vitest";
import { planLedgerReversal, replayTickerPosition } from "@/lib/ledger-reversal";

describe("ledger reversal", () => {
  const solBuy = {
    _id: "buy-sol",
    type: "buy",
    ticker: "SOL",
    asset_type: "crypto",
    asset_name: "Solana",
    quantity: 0.4,
    price: 116.52,
    fees: 0.47,
    cash_nzd: -82.9,
    total: -82.9,
    executed_at: "2026-09-25T01:00:00.000Z",
  };

  it("removes an accidental SOL buy from quantity and gives the cash debit back", () => {
    const opened = planLedgerReversal("user-tt", solBuy, [solBuy], { shares: 0.4, averageCost: 116.52 });
    expect(opened.cashDeltaNzd).toBeCloseTo(82.9, 2);
    expect(opened.holdingAfter).toBeNull();
    expect(opened.holdingAction).toBe("delete");

    const onTop = planLedgerReversal("user-tt", solBuy, [solBuy], { shares: 1.4, averageCost: 100 });
    expect(onTop.holdingAction).toBe("update");
    expect(onTop.holdingAfter?.shares).toBe(1);
    expect(onTop.holdingAfter?.averageCost).toBe(100);
  });

  it("keeps earlier lots when a later buy is the row being removed", () => {
    const earlier = { ...solBuy, _id: "buy-1", quantity: 1, price: 100, fees: 0, executed_at: "2026-09-01T00:00:00.000Z" };
    const plan = planLedgerReversal("user-tt", solBuy, [earlier, solBuy], { shares: 1.4, averageCost: 110 });
    expect(plan.holdingAction).toBe("update");
    expect(plan.holdingAfter?.shares).toBe(1);
    expect(plan.holdingAfter?.averageCost).toBeCloseTo(100, 4);
    expect(replayTickerPosition([earlier, solBuy], "SOL", "crypto")?.shares).toBeCloseTo(1.4, 4);
  });
});
