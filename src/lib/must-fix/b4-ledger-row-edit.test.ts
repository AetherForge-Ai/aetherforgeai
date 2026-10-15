import { describe, it, expect } from "vitest";
import { firstOversell, planLedgerReversal, OVERSELL_BLOCK } from "@/lib/ledger-reversal";
import { editedTradeRow } from "@/lib/ledger-row-edit";

const t = (id: string, type: string, q: number, day: number) =>
  ({ _id: id, type, ticker: "AIR.NZ", asset_type: "stock", quantity: q, price: 1, fees: 0, execution_status: "filled", executed_at: `2026-01-${String(day).padStart(2, "0")}T00:00:00Z` }) as never;

describe("BL-7 oversell guard", () => {
  it("passes a covered ledger", () => {
    expect(firstOversell([t("a", "buy", 10, 1), t("b", "sell", 10, 2)], "AIR.NZ", "stock")).toBeNull();
  });
  it("flags the first uncovered sell, in time order", () => {
    expect(firstOversell([t("b", "sell", 5, 2), t("c", "sell", 6, 3), t("a", "buy", 10, 1)], "air.nz", "stock")).toBe("c");
  });
  it("blocks removing a buy that a later sell depends on", () => {
    const rows = [t("a", "buy", 10, 1), t("b", "sell", 8, 2)];
    const plan = planLedgerReversal("u", rows[0], rows, null as never);
    expect(plan.blockedReason).toBe(OVERSELL_BLOCK);
  });
  it("allows removing the sell", () => {
    const rows = [t("a", "buy", 10, 1), t("b", "sell", 8, 2)];
    expect(planLedgerReversal("u", rows[1], rows, null as never).blockedReason).toBeNull();
  });
});

describe("BL-7 edit validation", () => {
  const row = { quantity: 10, price: 2, fees: 1, executed_at: "2026-01-01T00:00:00.000Z" };
  it("keeps unchanged fields", () => expect(editedTradeRow(row, { price: 3 })).toEqual({ row: { ...row, price: 3 } }));
  it("rejects zero, negative fees, bad and future dates", () => {
    expect(editedTradeRow(row, { quantity: 0 })).toHaveProperty("error");
    expect(editedTradeRow(row, { fees: -1 })).toHaveProperty("error");
    expect(editedTradeRow(row, { executed_at: "nope" })).toHaveProperty("error");
    expect(editedTradeRow(row, { executed_at: "2099-01-01" })).toHaveProperty("error");
  });
});
