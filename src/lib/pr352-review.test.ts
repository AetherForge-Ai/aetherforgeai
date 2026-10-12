import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const query = vi.hoisted(() => vi.fn());
const getRecordById = vi.hoisted(() => vi.fn());
const editRecordById = vi.hoisted(() => vi.fn());
const createRecord = vi.hoisted(() => vi.fn());
const deleteRecordById = vi.hoisted(() => vi.fn());

vi.mock("@/lib/totalum", () => ({
  totalumSdk: {
    crud: {
      query,
      getRecordById,
      editRecordById,
      createRecord,
      deleteRecordById,
    },
  },
}));

vi.mock("@/lib/session", () => ({
  getStableSessionUser: async () => ({
    _id: "user-pr352",
    id: "user-pr352",
    email: "member@example.com",
    name: "Member",
    cash_balance: 10000,
  }),
  getTradeSessionUser: async () => ({
    _id: "user-pr352",
    id: "user-pr352",
    email: "member@example.com",
    name: "Member",
    cash_balance: 10000,
  }),
  isStripeConfigured: () => false,
}));

vi.mock("@/lib/market-data", () => ({
  fetchLivePrice: async () => null,
  fetchLiveQuotes: async () => ({}),
  fetchCryptoQuotes: async () => ({}),
  isLiveDataConfigured: () => false,
  resolveCompanyNames: async () => ({}),
}));

vi.mock("@/lib/fx", () => ({
  getFxSnapshot: async () => ({ ratesToNZD: { NZD: 1, USD: 1.6, AUD: 1.1 }, sourced: true, live: true }),
  historicalNzdPerUnit: async () => null,
}));

import { GET } from "@/app/api/stocks/route";
import { presentMarketCoin } from "@/lib/crypto-api-body";
import { chainForTicker, chainFromPaprikaCoin } from "@/lib/crypto-board";
import { CONFIRM_QUOTE_FRESH_MS, confirmCryptoQuote } from "@/lib/crypto-board-store";
import { installSnapshotDurable, resetCryptoSnapshotsForTests } from "@/lib/crypto-snapshot";
import { __resetBookCacheForTests, writeBookCache } from "@/lib/book-cache";
import { applyTransaction } from "@/lib/transactions";

const user = {
  _id: "user-pr352",
  id: "user-pr352",
  email: "member@example.com",
  name: "Member",
  cash_balance: 10000,
};

beforeEach(() => {
  __resetBookCacheForTests();
  query.mockReset();
  getRecordById.mockReset();
  editRecordById.mockReset();
  createRecord.mockReset();
  deleteRecordById.mockReset();
  getRecordById.mockImplementation(async (collection: string) => {
    if (collection === "user") return { data: { cash_balance: 10000 } };
    if (collection === "stock") return { data: { shares: 11 } };
    return { data: {} };
  });
  editRecordById.mockResolvedValue({ data: {} });
  createRecord.mockImplementation(async (collection: string) => ({ data: { _id: `${collection}-1` } }));
  deleteRecordById.mockResolvedValue({ data: {} });
});

afterEach(() => {
  resetCryptoSnapshotsForTests();
  vi.unstubAllGlobals();
});

describe("review of e2b7ebd", () => {
  it("applies FIFO cost after a partial sell even when the lot date is already stored", async () => {
    query.mockImplementation(async (collection: string) => {
      if (collection === "stock") {
        return {
          data: [
            {
              _id: "air-1",
              user: "user-pr352",
              ticker: "AIR.NZ",
              asset_type: "stock",
              shares: 10,
              purchase_price: 15,
              purchase_date: "2026-01-01",
              current_price: 18,
              company_name: "Air New Zealand",
            },
          ],
        };
      }
      if (collection === "transaction") {
        return {
          data: [
            { _id: "b1", type: "buy", ticker: "AIR.NZ", quantity: 10, price: 10, executed_at: "2026-01-01", currency: "NZD", user: "user-pr352" },
            { _id: "b2", type: "buy", ticker: "AIR.NZ", quantity: 10, price: 20, executed_at: "2026-02-01", currency: "NZD", user: "user-pr352" },
            { _id: "s1", type: "sell", ticker: "AIR.NZ", quantity: 10, price: 18, executed_at: "2026-03-01", currency: "NZD", user: "user-pr352" },
          ],
        };
      }
      return { data: [] };
    });
    const res = await GET(new Request("http://localhost/api/stocks"));
    const body = (await res.json()) as { ok: boolean; data: Array<{ purchase_price: number; purchase_date: string }> };
    expect(body.ok).toBe(true);
    expect(body.data[0].purchase_price).toBeCloseTo(20, 5);
    expect(String(body.data[0].purchase_date)).toContain("2026-01-01");
    expect(query.mock.calls.some((call) => call[0] === "transaction")).toBe(true);
  });

  it("buys into a legacy holding that has no asset_type instead of creating a second row", async () => {
    const filters: Array<Record<string, unknown>> = [];
    query.mockImplementation(async (collection: string, args?: { _filter?: Record<string, unknown> }) => {
      if (collection === "stock") {
        filters.push(args?._filter || {});
        if (args?._filter && "asset_type" in args._filter) return { data: [] };
        return {
          data: [
            {
              _id: "legacy-air",
              ticker: "air.nz",
              shares: 10,
              purchase_price: 1.5,
              user: "user-pr352",
            },
          ],
        };
      }
      return { data: [] };
    });
    const result = await applyTransaction(
      user,
      {
        type: "buy",
        ticker: "AIR.NZ",
        asset_type: "stock",
        quantity: 1,
        price: 2,
        trade_date: "2026-10-13",
      },
      { rejectionChecked: true }
    );
    expect(result.holdingId).toBe("legacy-air");
    expect(filters).toHaveLength(1);
    expect(filters[0]).not.toHaveProperty("asset_type");
    expect(createRecord.mock.calls.some((call) => call[0] === "stock")).toBe(false);
    expect(editRecordById.mock.calls.some((call) => call[0] === "stock" && call[1] === "legacy-air")).toBe(true);
  });

  it("averages a buy from the stored holding, not the FIFO stocks cache", async () => {
    writeBookCache("user-pr352:stocks:all", [
      {
        _id: "fifo-air",
        ticker: "AIR.NZ",
        asset_type: "stock",
        shares: 10,
        purchase_price: 20,
        current_price: 18,
        user: "user-pr352",
      },
    ]);
    const filters: Array<Record<string, unknown>> = [];
    query.mockImplementation(async (collection: string, args?: { _filter?: Record<string, unknown> }) => {
      if (collection === "stock") {
        filters.push(args?._filter || {});
        return {
          data: [
            {
              _id: "stored-air",
              ticker: "air.nz",
              shares: 10,
              purchase_price: 1.5,
              user: "user-pr352",
            },
          ],
        };
      }
      return { data: [] };
    });
    createRecord.mockImplementation(async (collection: string) => {
      if (collection === "transaction") return { data: {} };
      return { data: { _id: `${collection}-1` } };
    });
    await expect(
      applyTransaction(
        user,
        {
          type: "buy",
          ticker: "AIR.NZ",
          asset_type: "stock",
          quantity: 1,
          price: 2,
          trade_date: "2026-10-13",
        },
        { rejectionChecked: true }
      )
    ).rejects.toThrow(/not saved/i);
    expect(filters).toHaveLength(1);
    expect(filters[0]).not.toHaveProperty("asset_type");
    const stockEdits = editRecordById.mock.calls.filter((call) => call[0] === "stock" && call[1] === "stored-air");
    const averaged = stockEdits[0]?.[2] as { purchase_price?: number; shares?: number };
    const rolledBack = stockEdits[stockEdits.length - 1]?.[2] as { purchase_price?: number; shares?: number };
    expect(averaged.purchase_price).toBeCloseTo((10 * 1.5 + 2) / 11, 5);
    expect(averaged.purchase_price).not.toBeCloseTo((10 * 20 + 2) / 11, 4);
    expect(rolledBack).toMatchObject({ shares: 10, purchase_price: 1.5 });
  });

  it("refreshes a quote older than a minute and keeps the saved pxat when the refresh times out", async () => {
    expect(CONFIRM_QUOTE_FRESH_MS).toBe(60_000);
    const freshAt = new Date().toISOString();
    installCoin(freshAt);
    const freshFetch = vi.fn();
    vi.stubGlobal("fetch", freshFetch);
    const fresh = await confirmCryptoQuote({ symbol: "PEPE" });
    expect(fresh?.price).toBe(0.00001);
    expect(fresh?.quotedAt).toBe(freshAt);
    expect(freshFetch).not.toHaveBeenCalled();

    const staleAt = new Date(Date.now() - 90_000).toISOString();
    installCoin(staleAt);
    vi.stubGlobal("fetch", () => new Promise(() => {}));
    const started = Date.now();
    const timedOut = await confirmCryptoQuote({ symbol: "PEPE" });
    const waited = Date.now() - started;
    expect(waited).toBeGreaterThanOrEqual(350);
    expect(waited).toBeLessThan(900);
    expect(timedOut?.price).toBe(0.00001);
    expect(timedOut?.quotedAt).toBe(staleAt);

    installCoin(staleAt);
    vi.stubGlobal("fetch", async (url: string) => {
      if (String(url).includes("/search")) {
        return jsonResponse({ currencies: [{ id: "pepe-pepe", symbol: "PEPE" }] });
      }
      return jsonResponse({
        last_updated: "2026-10-12T12:00:00.000Z",
        quotes: { USD: { price: 0.00002 } },
      });
    });
    const refreshed = await confirmCryptoQuote({ symbol: "PEPE" });
    expect(refreshed?.price).toBe(0.00002);
    expect(refreshed?.quotedAt).toBe("2026-10-12T12:00:00.000Z");
  });

  it("uses the feed platform for MOVE, METH and ZK and does not invent a chain", () => {
    expect(chainForTicker("MOVE")).toBe("");
    expect(chainForTicker("METH")).toBe("");
    expect(chainForTicker("ZK")).toBe("");
    expect(
      chainFromPaprikaCoin({
        type: "token",
        symbol: "MOVE",
        name: "Movement",
        platform: "eth-ethereum",
        contracts: [{ platform: "eth-ethereum", contract: "0xabc" }],
      })
    ).toBe("Ethereum");
    expect(
      chainFromPaprikaCoin({
        type: "token",
        symbol: "METH",
        name: "Mantle Staked Ether",
        platform: "eth-ethereum",
      })
    ).toBe("Ethereum");
    expect(chainFromPaprikaCoin({ type: "token", symbol: "ZK", platform: "eth-ethereum" })).toBe("Ethereum");
    expect(chainFromPaprikaCoin({ type: "token", symbol: "ZK", platform: "zksync" })).toBe("zkSync");
    expect(chainFromPaprikaCoin({ type: "token", symbol: "MOVE", name: "Movement" })).toBe("");
    const blank = presentMarketCoin({
      symbol: "MOVE",
      name: "Movement",
      source: "coinpaprika",
      price: 1,
      blockchain: "",
    });
    expect(blank.blockchain).toBe("");
    expect(blank.blockchainReason).toMatch(/platform/);
    expect(chainForTicker("EURC")).toBe("Ethereum");
    expect(chainForTicker("KAS")).toBe("Kaspa");
    expect(chainForTicker("BERA")).toBe("Berachain");
    expect(chainForTicker("USDD")).toBe("TRON");
    expect(chainForTicker("AERO")).toBe("Base");
    expect(chainForTicker("PENGU")).toBe("Solana");
  });
});

function installCoin(at: string) {
  resetCryptoSnapshotsForTests();
  const raw = JSON.stringify({
    at,
    coins: [{ id: "pepe", symbol: "PEPE", name: "Pepe", price: 0.00001, source: "coinpaprika" }],
  });
  installSnapshotDurable({
    read: async (id) => (id === "crypto" ? raw : null),
    write: async () => true,
  });
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}
