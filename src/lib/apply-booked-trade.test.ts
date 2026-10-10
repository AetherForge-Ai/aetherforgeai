import { describe, expect, it } from "vitest";
import { applyBookedTradeToHoldings, type HoldingSnapshot } from "./apply-booked-trade";

const aapl: HoldingSnapshot = {
  _id: "1",
  ticker: "AAPL",
  asset_type: "stock",
  company_name: "Apple",
  shares: 2,
  purchase_price: 100,
  current_price: 150,
};

describe("applyBookedTradeToHoldings", () => {
  it("adds a buy onto the existing holding in the same turn", () => {
    const next = applyBookedTradeToHoldings([aapl], {
      type: "buy",
      ticker: "aapl",
      asset_type: "stock",
      quantity: 1,
      price: 160,
    });
    expect(next).toHaveLength(1);
    expect(next[0].shares).toBe(3);
    expect(next[0].current_price).toBe(150);
    expect(next[0].purchase_price).toBeCloseTo((2 * 100 + 160) / 3, 6);
  });

  it("opens a row when the ticker is new and removes it when the sell closes it", () => {
    const opened = applyBookedTradeToHoldings([], {
      type: "buy",
      ticker: "MSFT",
      asset_type: "stock",
      asset_name: "Microsoft",
      quantity: 4,
      price: 400,
    });
    expect(opened[0].shares).toBe(4);
    expect(opened[0].current_price).toBe(400);
    const closed = applyBookedTradeToHoldings(opened, {
      type: "sell",
      ticker: "MSFT",
      asset_type: "stock",
      quantity: 4,
      price: 410,
    });
    expect(closed).toEqual([]);
  });

  it("leaves holdings alone for cash movements", () => {
    const next = applyBookedTradeToHoldings([aapl], { type: "deposit", quantity: 100, price: 1 });
    expect(next).toEqual([aapl]);
  });
});