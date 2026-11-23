import { beforeEach, describe, expect, it, vi } from "vitest";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/totalum", () => ({ totalumSdk: { crud: { query } } }));

import { ACCOUNTANT_LEDGER_SORT, ACCOUNTANT_ROW_CAP } from "@/lib/accountant-export";
import { countLedgerByOffset, loadAccountantLedger, totalFromCount } from "@/lib/accountant-export.server";

describe("loadAccountantLedger", () => {
  beforeEach(() => {
    query.mockReset();
  });

  it("asks Totalum for newest execution time then id, and uses _count._total", async () => {
    query.mockResolvedValue({
      data: [
        { _id: "new", type: "buy", ticker: "FPH.NZ", executed_at: "2026-06-01", _count: { _total: 8123 } },
        { _id: "old", type: "buy", ticker: "AIR.NZ", executed_at: "2026-01-01", _count: { _total: 8123 } },
      ],
    });
    const loaded = await loadAccountantLedger("user-a");
    expect(query).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith("transaction", {
      _filter: { user: "user-a" },
      _sort: ACCOUNTANT_LEDGER_SORT,
      _limit: ACCOUNTANT_ROW_CAP,
      _count: true,
    });
    expect(ACCOUNTANT_LEDGER_SORT).toEqual({ executed_at: "desc", _id: "asc" });
    expect(loaded.total).toBe(8123);
    expect(loaded.rows.map((row) => row._id)).toEqual(["new", "old"]);
    expect(loaded.rows[0]).not.toHaveProperty("_count");
  });

  it("pages with _offset when the capped read has no _count", async () => {
    query.mockImplementation(async (_table: string, options: { _limit?: number; _offset?: number; _count?: boolean; _sort?: unknown }) => {
      expect(options._sort).toEqual(ACCOUNTANT_LEDGER_SORT);
      if (options._count) {
        return { data: [{ _id: "a", executed_at: "2026-02-01" }, { _id: "b", executed_at: "2026-01-01" }] };
      }
      if (options._offset === 0) return { data: [{ _id: "a" }, { _id: "b" }, { _id: "c" }] };
      return { data: [] };
    });
    const loaded = await loadAccountantLedger("user-a", 2);
    expect(loaded.rows.map((row) => row._id)).toEqual(["a", "b"]);
    expect(loaded.total).toBe(3);
    expect(query).toHaveBeenCalledWith(
      "transaction",
      expect.objectContaining({ _offset: 0, _limit: 1000, _select: { _id: true }, _sort: ACCOUNTANT_LEDGER_SORT })
    );
  });

  it("counts a short book from the rows when _count is missing and the page is not full", async () => {
    query.mockResolvedValue({ data: [{ _id: "only", executed_at: "2026-01-01", type: "fee" }] });
    const loaded = await loadAccountantLedger("user-a");
    expect(loaded.total).toBe(1);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("reads _count._total only from the payload", () => {
    expect(totalFromCount([{ _count: { _total: 40 } }])).toBe(40);
    expect(totalFromCount([])).toBeNull();
    expect(totalFromCount([{ _id: "x" }])).toBeNull();
  });

  it("stops the offset count on a short page", async () => {
    query.mockImplementation(async (_table: string, options: { _offset?: number }) => {
      if (options._offset === 0) return { data: [{ _id: "1" }, { _id: "2" }] };
      if (options._offset === 2) return { data: [{ _id: "3" }] };
      return { data: [] };
    });
    await expect(countLedgerByOffset("user-a", 2)).resolves.toBe(3);
  });
});
