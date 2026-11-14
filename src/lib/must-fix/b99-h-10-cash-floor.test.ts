/**
 * H-10-CASH-FLOOR: a broker file is the cash record. A negative balance is saved.
 * A manual trade that would take cash below zero is still refused.
 */
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown> & { _id: string };

const harness = vi.hoisted(() => {
  const collections = new Map<string, Row[]>();
  let seq = 0;
  let buyCreates = 0;
  let failBuyNumber = 0;

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
      if (collection === "transaction" && body?.type === "buy") {
        buyCreates += 1;
        if (failBuyNumber > 0 && buyCreates === failBuyNumber) throw new Error("import row failed");
      }
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
  function reset() {
    collections.clear();
    buyCreates = 0;
    failBuyNumber = 0;
  }
  return {
    methods,
    bucket,
    reset,
    set failBuyNumber(value: number) { failBuyNumber = value; },
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/totalum", () => ({ totalumSdk: { crud: harness.methods } }));
vi.mock("@/lib/fx", () => ({
  historicalNzdPerUnit: async (currency: string) => (currency === "AUD" ? 1.1 : currency === "USD" ? 1.6 : currency === "NZD" ? 1 : null),
  getFxSnapshot: async () => ({
    ratesToNZD: { NZD: 1, USD: 1.6, AUD: 1.1 },
    live: false,
    sourced: true,
    asOf: "2026-03-01T00:00:00.000Z",
    fetchedAt: "2026-03-01T00:00:00.000Z",
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
import { applyTransaction } from "@/lib/transactions";
import { importCashWarning } from "@/lib/import/cash-guard";

const IBKR = readFileSync("src/lib/import/fixtures/ibkr.csv", "utf8");
const WARNING = "Your cash will be NZ$-588.90 after this import. Add a deposit if that's not right.";

function openBook(cash: number) {
  harness.reset();
  const id = "cash-floor-user";
  harness.bucket("user").push({ _id: id, cash_balance: cash });
  return { _id: id, email: "qa@example.test", name: "QA", cash_balance: cash, subscription_plan: "starter_monthly", ticker_limit: 50 };
}

function cashOf(): number {
  const row = harness.bucket("user").find((item) => item._id === "cash-floor-user");
  return Number(row?.cash_balance) || 0;
}

function trades() {
  return harness.bucket("transaction").filter((row) => row.user === "cash-floor-user" && (row.type === "buy" || row.type === "sell"));
}

beforeEach(() => {
  harness.reset();
});

describe("H-10 cash floor", () => {
  it("ibkr.csv on a NZ$0 book persists 3 trades and cash -588.90", async () => {
    const user = openBook(0);
    const preview = await runH10Import(user as never, IBKR, { engine: "h10", action: "preview" });
    const previewBody = (await preview.json()) as { data?: { cashWarning?: string; toWrite?: unknown[] } };
    expect(previewBody.data?.cashWarning).toBe(WARNING);
    expect(previewBody.data?.toWrite).toHaveLength(3);
    expect(importCashWarning(0, -588.9)).toBe(WARNING);

    const saved = await runH10Import(user as never, IBKR, { engine: "h10", action: "commit" });
    const body = (await saved.json()) as { ok?: boolean; data?: { written?: number } };
    expect(saved.status, JSON.stringify(body)).toBe(200);
    expect(body.data?.written).toBe(3);
    expect(trades()).toHaveLength(3);
    expect(harness.bucket("transaction").some((row) => /would otherwise make paper cash negative/.test(String(row.notes || "")))).toBe(false);
    expect(Math.abs(cashOf() - -588.9)).toBeLessThanOrEqual(0.01);
  });

  it("a manual trade that would go below zero is still refused", async () => {
    const user = openBook(0);
    await expect(applyTransaction(user as never, {
      type: "buy",
      ticker: "AIR.NZ",
      asset_type: "stock",
      quantity: 1,
      price: 5,
      fees: 0,
      executed_at: "2026-03-02",
      trade_date: "2026-03-02",
    })).rejects.toThrow(/Insufficient cash|below zero/);
    expect(trades()).toHaveLength(0);
    expect(cashOf()).toBe(0);
    expect(readFileSync("src/components/dashboard/RecordTransactionPanel.tsx", "utf8")).toContain('failSave("This would take cash below zero.")');
  });

  it("a failed import still writes nothing", async () => {
    const user = openBook(0);
    harness.failBuyNumber = 2;
    const saved = await runH10Import(user as never, IBKR, { engine: "h10", action: "commit" });
    const body = (await saved.json()) as { error?: string; data?: { written?: number } };
    expect(saved.status).toBe(400);
    expect(body.error).toMatch(/import row failed/);
    expect(body.data?.written).toBe(0);
    expect(harness.bucket("transaction")).toHaveLength(0);
    expect(harness.bucket("stock")).toHaveLength(0);
    expect(cashOf()).toBe(0);
  });
});
