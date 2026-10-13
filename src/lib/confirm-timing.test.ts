import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const LAG_MS = 400;

const createRecord = vi.hoisted(() => vi.fn());
const query = vi.hoisted(() => vi.fn());
const getRecordById = vi.hoisted(() => vi.fn());
const editRecordById = vi.hoisted(() => vi.fn());
const deleteRecordById = vi.hoisted(() => vi.fn());

function lag<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), LAG_MS));
}

vi.mock("@/lib/totalum", () => ({
  totalumSdk: {
    crud: { createRecord, query, getRecordById, editRecordById, deleteRecordById },
  },
}));

vi.mock("@/lib/fx", () => ({
  getFxSnapshot: vi.fn(async () => ({
    ratesToNZD: { NZD: 1, USD: 1.7, AUD: 1.12 },
    live: true,
    sourced: true,
    asOf: "2026-10-13T00:00:00.000Z",
  })),
  historicalNzdPerUnit: vi.fn(async () => null),
}));

vi.mock("@/lib/market-data", () => ({
  fetchLivePrice: vi.fn(async () => null),
  isLiveDataConfigured: vi.fn(() => false),
  fetchCryptoQuotes: vi.fn(async () => ({})),
}));

vi.mock("@/lib/crypto-coingecko", () => ({
  dexQuoteRows: vi.fn(async () => []),
}));

vi.mock("@/lib/metals", () => ({
  getMetalsSpot: vi.fn(async () => ({})),
}));

vi.mock("@/lib/crypto-board-store", () => ({
  confirmCryptoQuote: vi.fn(async () => null),
  priceFromSnapshot: vi.fn(async () => null),
}));

import { applyTransaction } from "@/lib/transactions";

const user = {
  _id: "user-1",
  id: "user-1",
  email: "member@example.com",
  name: "Member",
  cash_balance: 100000,
};

beforeEach(() => {
  let stockShares = 0;
  createRecord.mockReset();
  createRecord.mockImplementation(async (collection: string, body?: { shares?: number }) => {
    if (collection === "stock" && body?.shares != null) stockShares = Number(body.shares);
    return lag({ data: { _id: collection === "stock" ? "hold-1" : "tx-1", shares: body?.shares } });
  });
  query.mockReset();
  query.mockImplementation(async () => lag({ data: [] }));
  getRecordById.mockReset();
  getRecordById.mockImplementation(async (collection: string) => {
    if (collection === "user") return lag({ data: { cash_balance: 100000 } });
    return lag({ data: { shares: stockShares, purchase_price: 2 } });
  });
  editRecordById.mockReset();
  editRecordById.mockImplementation(async (collection: string, _id: string, body?: { shares?: number; cash_balance?: number }) => {
    if (collection === "stock") {
      if (body?.shares != null) stockShares = Number(body.shares);
      return lag({ data: { shares: stockShares, purchase_price: 2 } });
    }
    return lag({ data: { cash_balance: body?.cash_balance ?? 99900 } });
  });
  deleteRecordById.mockReset();
  deleteRecordById.mockImplementation(async () => lag({ data: {} }));
});

describe("confirm timing", () => {
  it("books a buy with lagged writes", async () => {
    const started = Date.now();
    const result = await applyTransaction(user, {
      type: "buy",
      ticker: "AIR.NZ",
      asset_type: "stock",
      quantity: 2,
      price: 2,
      fees: 0,
      confirm: true,
      fx_rate: 1,
      executed_at: "2026-10-13",
    });
    const elapsed = Date.now() - started;
    console.log(`[confirm-timing] buy elapsed=${elapsed}ms lag=${LAG_MS}ms`);
    expect(result.cashBalance).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(20_000);
  });
});
