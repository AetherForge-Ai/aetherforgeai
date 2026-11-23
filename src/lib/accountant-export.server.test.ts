import { beforeEach, describe, expect, it, vi } from "vitest";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/totalum", () => ({ totalumSdk: { crud: { query } } }));

import { ACCOUNTANT_LEDGER_SORT, ACCOUNTANT_PAGE_SIZE, ACCOUNTANT_ROW_CEILING, HOLDINGS_INCOMPLETE_NOTE } from "@/lib/accountant-export";
import { buildAccountantPack, orderLedgerRows, resolveAccountantRange } from "@/lib/accountant-export";
import { loadAccountantLedger } from "@/lib/accountant-export.server";
import type { AccountantLedgerRow } from "@/lib/accountant-export";

function buy(id: string, executedAt: string, tradeDate = executedAt.slice(0, 10)): AccountantLedgerRow {
  return {
    _id: id,
    user: "user-a",
    type: "buy",
    ticker: "OLD.NZ",
    asset_name: "Old Co",
    quantity: 1,
    price: 1,
    fill_price: 1,
    currency: "NZD",
    fx_rate: 1,
    executed_at: executedAt,
    trade_date: tradeDate,
    cash_nzd: -1,
  };
}

describe("loadAccountantLedger", () => {
  beforeEach(() => {
    query.mockReset();
  });

  it("pages 2,500 rows at 1,000 and keeps the oldest buys in an earlier tax year", async () => {
    const rows: AccountantLedgerRow[] = [
      ...Array.from({ length: 998 }, (_, index) => buy(`y1-${String(index).padStart(4, "0")}`, "2024-06-01T01:00:00.000Z")),
      { _id: "z-tie", ...buy("z-tie", "2024-06-01T01:00:00.000Z") },
      { _id: "a-tie", ...buy("a-tie", "2024-06-01T01:00:00.000Z") },
      { _id: "trade-only", user: "user-a", type: "buy", ticker: "OLD.NZ", asset_name: "Old Co", quantity: 1, price: 1, fill_price: 1, currency: "NZD", fx_rate: 1, trade_date: "2024-05-01", executed_at: "", cash_nzd: -1 },
      { _id: "div-old", user: "user-a", type: "dividend", ticker: "OLD.NZ", trade_date: "2024-12-01", cash_nzd: 2 },
      ...Array.from({ length: 997 }, (_, index) => buy(`y2-${String(index).padStart(4, "0")}`, "2025-06-01T01:00:00.000Z")),
      { _id: "div-new", user: "user-a", type: "dividend", ticker: "OLD.NZ", trade_date: "2025-12-01", executed_at: "2025-12-01T01:00:00.000Z", cash_nzd: 3 },
      ...Array.from({ length: 500 }, (_, index) => buy(`y3-${String(index).padStart(4, "0")}`, "2026-06-01T01:00:00.000Z")),
    ];
    expect(rows).toHaveLength(2500);
    const limits: number[] = [];
    query.mockImplementation(async (_table: string, options: { _limit: number; _offset?: number; _sort?: unknown; _filter?: unknown }) => {
      limits.push(options._limit);
      expect(options._limit).toBeLessThanOrEqual(1000);
      expect(options._limit).toBe(ACCOUNTANT_PAGE_SIZE);
      expect(options._sort).toEqual({ executed_at: "asc" });
      expect(options._sort).toEqual(ACCOUNTANT_LEDGER_SORT);
      expect(options._filter).toEqual({ user: "user-a" });
      const offset = options._offset ?? 0;
      return { data: rows.slice(offset, offset + options._limit) };
    });
    const loaded = await loadAccountantLedger("user-a");
    expect(loaded.truncated).toBe(false);
    expect(loaded.rows).toHaveLength(2500);
    expect(limits.every((limit) => limit <= 1000)).toBe(true);
    expect(query).toHaveBeenCalledTimes(3);
    expect(loaded.rows[0]._id).toBe("trade-only");
    const sameTime = loaded.rows.filter((row) => row.executed_at === "2024-06-01T01:00:00.000Z").map((row) => row._id);
    expect(sameTime.indexOf("a-tie")).toBeLessThan(sameTime.indexOf("z-tie"));

    const range = resolveAccountantRange({ year: "2025", asOf: "2025-03-31", from: "2024-04-01", to: "2025-03-31" }, "2026-11-23");
    if (!range.ok) throw new Error(range.error);
    const pack = buildAccountantPack({
      rows: loaded.rows,
      range: range.range,
      generatedAt: "2026-11-23T06:00:00.000Z",
      rowsRead: loaded.rows.length,
    });
    const tx = pack.transactions.replace(/^\uFEFF/, "").trim().split("\n").slice(1);
    expect(tx).toHaveLength(1002);
    expect(tx.some((line) => line.startsWith("2024-05-01,buy,OLD.NZ"))).toBe(true);
    expect(pack.transactions).not.toContain("y2-");
    expect(pack.transactions).not.toContain("y3-");
    expect(pack.dividends).toContain("2024-12-01");
    expect(pack.dividends).not.toContain("2025-12-01");
    const holding = pack.holdings.replace(/^\uFEFF/, "").trim().split("\n")[1].split(",");
    expect(holding[0]).toBe("OLD.NZ");
    expect(holding[2]).toBe("1001");
    expect(holding[4]).toBe("1001.00");
    expect(pack.readme).toContain("Ledger rows read: 2500.");
    expect(pack.readme).toContain("transactions.csv rows: 1002.");
    expect(pack.readme).toContain("dividends.csv rows: 1.");
    expect(pack.readme).toContain("holdings.csv rows: 1.");
  });

  it("stops at 50,000 rows and blanks holdings", async () => {
    const limits: number[] = [];
    query.mockImplementation(async (_table: string, options: { _limit: number; _offset?: number }) => {
      limits.push(options._limit);
      expect(options._limit).toBeLessThanOrEqual(1000);
      const offset = options._offset ?? 0;
      if (offset >= ACCOUNTANT_ROW_CEILING) return { data: [] };
      return {
        data: Array.from({ length: options._limit }, (_, index) => ({
          _id: `r-${offset + index}`,
          type: offset + index < 2 ? "buy" : "deposit",
          ticker: "BIG.NZ",
          quantity: 1,
          price: 2,
          currency: "NZD",
          fx_rate: 1,
          executed_at: "2024-06-01T00:00:00.000Z",
          trade_date: "2024-06-01",
        })),
      };
    });
    const loaded = await loadAccountantLedger("user-a");
    expect(loaded.truncated).toBe(true);
    expect(loaded.rows).toHaveLength(50_000);
    expect(query).toHaveBeenCalledTimes(50);
    expect(limits.every((limit) => limit === 1000 && limit <= 1000)).toBe(true);
    const range = resolveAccountantRange({ year: "2025", asOf: "2025-03-31", from: "2024-04-01", to: "2025-03-31" }, "2026-11-23");
    if (!range.ok) throw new Error(range.error);
    const pack = buildAccountantPack({
      rows: loaded.rows,
      range: range.range,
      generatedAt: "2026-11-23T06:00:00.000Z",
      rowsRead: loaded.rows.length,
      incomplete: loaded.truncated,
    });
    expect(pack.holdings.replace(/^\uFEFF/, "").trim().split("\n")).toEqual([
      "Holding,Name,Quantity,Currency,Cost basis NZD,Cost FX rate,Cost FX date,Cost FX detail,Market value NZD,Market FX rate,Market FX date,Price updated,Data note",
    ]);
    expect(pack.readme).toContain(HOLDINGS_INCOMPLETE_NOTE);
    expect(pack.readme).toContain("Ledger rows read: 50000.");
    expect(pack.readme).toContain("holdings.csv rows: 0.");
    expect(pack.transactions).toContain("r-0");
    expect(pack.transactions).toContain("r-1");
  });

  it("tie-breaks equal execution times by id without a second server sort key", () => {
    const ordered = orderLedgerRows([
      { _id: "b", type: "buy", executed_at: "2024-06-01T01:00:00.000Z" },
      { _id: "a", type: "buy", executed_at: "2024-06-01T01:00:00.000Z" },
      { _id: "early", type: "buy", trade_date: "2024-05-01", executed_at: "" },
    ]);
    expect(ordered.map((row) => row._id)).toEqual(["early", "a", "b"]);
    expect(ACCOUNTANT_LEDGER_SORT).toEqual({ executed_at: "asc" });
    expect(Object.keys(ACCOUNTANT_LEDGER_SORT)).toEqual(["executed_at"]);
  });
});
