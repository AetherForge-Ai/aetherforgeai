/**
 * H-10 undo cash floor: refuse only a final cash balance that is below zero
 * and more negative than the cash already booked. The whole import batch is judged once.
 */
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { planImportUndo } from "@/lib/import-undo-plan";

type Row = Record<string, unknown> & { _id: string };

const harness = vi.hoisted(() => {
  const collections = new Map<string, Row[]>();
  let seq = 0;
  function bucket(name: string): Row[] {
    let rows = collections.get(name);
    if (!rows) {
      rows = [];
      collections.set(name, rows);
    }
    return rows;
  }
  function copy(row: Row): Row {
    return { ...row };
  }
  const methods = {
    async query(collection: string, body?: { _filter?: Record<string, unknown> }) {
      const filter = body?._filter;
      const data = bucket(collection).filter((row) => {
        if (!filter) return true;
        return Object.entries(filter).every(([key, value]) => key.startsWith("_") || row[key] === value);
      });
      return { data: data.map(copy) };
    },
    async getRecordById(collection: string, id: string) {
      const row = bucket(collection).find((item) => item._id === id);
      return { data: row ? copy(row) : null };
    },
    async createRecord(collection: string, body?: Record<string, unknown>) {
      const row = { ...(body || {}), _id: `row-${++seq}` } as Row;
      bucket(collection).push(row);
      return { data: copy(row) };
    },
    async editRecordById(collection: string, id: string, body?: Record<string, unknown>) {
      const row = bucket(collection).find((item) => item._id === id);
      if (!row) throw new Error(`missing ${collection} ${id}`);
      Object.assign(row, body || {});
      return { data: copy(row) };
    },
    async deleteRecordById(collection: string, id: string) {
      const rows = bucket(collection);
      const at = rows.findIndex((item) => item._id === id);
      if (at >= 0) rows.splice(at, 1);
      return { data: { _id: id } };
    },
  };
  return {
    methods,
    bucket,
    reset() {
      collections.clear();
      seq = 0;
    },
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/session", () => ({
  getTradeSessionUser: async () => null,
  getStableSessionUser: async () => null,
}));
vi.mock("@/lib/totalum", () => ({ totalumSdk: { crud: harness.methods } }));
vi.mock("@/lib/fx", () => ({
  historicalNzdPerUnit: async (currency: string, day?: string | null) => {
    const ecb: Record<string, number> = {
      "AUD|2026-03-02": 1.1888,
      "AUD|2026-03-20": 1.2062,
      "USD|2026-04-01": 1.7322,
    };
    if (currency === "NZD") return 1;
    return ecb[`${currency}|${day || ""}`] ?? (currency === "AUD" ? 1.1 : currency === "USD" ? 1.6 : null);
  },
  getFxSnapshot: async () => ({
    ratesToNZD: { NZD: 1, USD: 1.7322, AUD: 1.1888 },
    live: false,
    sourced: true,
    asOf: "2026-04-01T00:00:00.000Z",
    fetchedAt: "2026-04-01T00:00:00.000Z",
  }),
}));
vi.mock("@/lib/market-data", () => ({
  fetchLivePrice: async () => null,
  isLiveDataConfigured: () => false,
  fetchCryptoQuotes: async () => ({}),
}));
vi.mock("@/lib/crypto-board-store", () => ({
  confirmCryptoQuote: async () => null,
  priceFromSnapshot: async () => null,
}));
vi.mock("@/lib/metals", () => ({ getMetalsSpot: async () => ({}) }));

import { runH10Import } from "@/lib/import/persist";
import { planOrApplyLedgerReversal } from "@/lib/ledger-reversal-apply";

const IBKR = readFileSync("src/lib/import/fixtures/ibkr.csv", "utf8");

let users = 0;
function openBook(cash = 0) {
  users += 1;
  const id = `undo-floor-${users}`;
  harness.bucket("user").push({ _id: id, cash_balance: cash, email: `${id}@example.test` });
  return {
    _id: id,
    email: `${id}@example.test`,
    name: "Member",
    cash_balance: cash,
    subscription_plan: "starter_monthly",
    ticker_limit: 50,
  };
}

function cashOf(userId: string): number {
  const row = harness.bucket("user").find((item) => item._id === userId);
  return Number(row?.cash_balance) || 0;
}

function tradesOf(userId: string) {
  return harness.bucket("transaction").filter((row) => row.user === userId && (row.type === "buy" || row.type === "sell" || row.type === "deposit"));
}

beforeEach(() => {
  harness.reset();
});

describe("H-10 undo cash floor", () => {
  it("undo of the below-zero ibkr.csv import returns to an empty book", async () => {
    const user = openBook(0);
    const saved = await runH10Import(user as never, IBKR, { engine: "h10", action: "commit" });
    const savedBody = (await saved.json()) as { data?: { batchId?: string; written?: number } };
    expect(saved.status, JSON.stringify(savedBody)).toBe(200);
    expect(savedBody.data?.written).toBe(3);
    expect(cashOf(user._id)).toBeCloseTo(-634.29, 2);

    const undone = await runH10Import(user as never, IBKR, { engine: "h10", action: "undo", batchId: savedBody.data?.batchId });
    const body = (await undone.json()) as { error?: string; data?: { undone?: number } };
    expect(undone.status, JSON.stringify(body)).toBe(200);
    expect(body.data?.undone).toBe(3);
    expect(cashOf(user._id)).toBeCloseTo(0, 2);
    expect(tradesOf(user._id)).toHaveLength(0);
    expect(harness.bucket("stock").filter((row) => row.user === user._id)).toHaveLength(0);
  });

  it("deleting the NVDA buy leaves cash less negative", async () => {
    const user = openBook(0);
    const saved = await runH10Import(user as never, IBKR, { engine: "h10", action: "commit" });
    expect(saved.status).toBe(200);
    const before = cashOf(user._id);
    const nvda = harness.bucket("transaction").find((row) => row.user === user._id && row.ticker === "NVDA" && row.type === "buy");
    expect(nvda?._id).toBeTruthy();

    await planOrApplyLedgerReversal(String(nvda?._id), true);
    const after = cashOf(user._id);
    expect(after).toBeGreaterThan(before);
    expect(after).toBeCloseTo(-286.12, 2);
    expect(harness.bucket("transaction").some((row) => row._id === nvda?._id)).toBe(false);
    expect(harness.bucket("transaction").filter((row) => row.user === user._id && row.ticker === "BHP.AX")).toHaveLength(2);
  });

  it("deleting a deposit that later buys used is still refused", async () => {
    const user = openBook(200);
    harness.bucket("transaction").push(
      { _id: "dep-1", user: user._id, type: "deposit", cash_nzd: 1000, total: 1000, quantity: 1000, price: 1, executed_at: "2026-03-01T00:00:00.000Z", notes: "" },
      { _id: "buy-1", user: user._id, type: "buy", ticker: "AIR.NZ", asset_type: "stock", quantity: 10, price: 80, cash_nzd: -800, executed_at: "2026-03-02T00:00:00.000Z", notes: "" }
    );
    harness.bucket("stock").push({ _id: "hold-1", user: user._id, ticker: "AIR.NZ", asset_type: "stock", shares: 10, purchase_price: 80 });

    await expect(planOrApplyLedgerReversal("dep-1", true)).rejects.toThrow(/would take cash to NZ\$-800\.00/);
    expect(cashOf(user._id)).toBe(200);
    expect(harness.bucket("transaction").some((row) => row._id === "dep-1")).toBe(true);
  });

  it("an intermediate-negative but final-OK batch undo succeeds", () => {
    const tag = "batch=impabc123def456";
    const buy = { _id: "b", type: "buy", ticker: "MSFT", asset_type: "stock", quantity: 1, price: 10, cash_nzd: -250, executed_at: "2026-04-01T00:00:00.000Z", notes: tag };
    const sell = { _id: "s", type: "sell", ticker: "MSFT", asset_type: "stock", quantity: 1, price: 10, cash_nzd: 200, executed_at: "2026-04-02T00:00:00.000Z", notes: tag };
    const plan = planImportUndo({ ledger: [buy, sell], batchId: "impabc123def456", cashNzd: 100 });
    expect(plan.ok).toBe(true);
    if (plan.ok) {
      expect(plan.ids).toEqual(["s", "b"]);
      expect(plan.cashAfter).toBe(150);
    }
  });
});
