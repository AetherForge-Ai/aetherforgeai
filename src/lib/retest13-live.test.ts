import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const query = vi.hoisted(() => vi.fn());
const getRecordById = vi.hoisted(() => vi.fn());
const editRecordById = vi.hoisted(() => vi.fn());
const createRecord = vi.hoisted(() => vi.fn());
const deleteRecordById = vi.hoisted(() => vi.fn());

vi.mock("@/lib/totalum", () => ({
  totalumSdk: { crud: { query, getRecordById, editRecordById, createRecord, deleteRecordById } },
}));

vi.mock("@/lib/fx", () => ({
  getFxSnapshot: async () => ({ ratesToNZD: { NZD: 1, USD: 1.6, AUD: 1.1 }, sourced: true, live: true }),
  historicalNzdPerUnit: async () => 1.6,
}));

vi.mock("@/lib/market-data", () => ({
  fetchLivePrice: async () => null,
  fetchLiveQuotes: async () => ({}),
  fetchCryptoQuotes: async () => ({}),
  isLiveDataConfigured: () => false,
  resolveCompanyNames: async () => ({}),
}));

import {
  applyBookedTradeToHoldings,
  bookedGuardAfterEvent,
  isPendingBookedRow,
  retainBookedHolding,
  reviewBookedSnapshot,
  snapshotOmitsBookedBuy,
} from "@/lib/apply-booked-trade";
import { __resetBookCacheForTests } from "@/lib/book-cache";
import { chainForTicker, DEX_REQUEST_FRESH_MS, pricesAsAtLabel, SNAPSHOT_REFRESH_MS } from "@/lib/crypto-board";
import { coinsFromCoinGeckoMarkets } from "@/lib/crypto-keyless-seed";
import { coinDisplayName } from "@/lib/crypto-names";
import { stalePriceReason } from "@/lib/crypto-market";
import { mergeConfirmIntoLedger } from "@/lib/confirm-ledger";
import { applyTransaction } from "@/lib/transactions";
import { resolveSparkQuote } from "@/lib/yahoo-finance";

const user = {
  _id: "user-live",
  id: "user-live",
  email: "member@example.com",
  name: "Member",
  cash_balance: 100000,
};

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

beforeEach(() => {
  __resetBookCacheForTests();
  query.mockReset();
  getRecordById.mockReset();
  editRecordById.mockReset();
  createRecord.mockReset();
  deleteRecordById.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("retest 13 confirm and holdings", () => {
  it("writes the ledger before cash and reads the holding back beside the cash write", async () => {
    const order: string[] = [];
    query.mockImplementation(async (collection: string) => {
      await wait(40);
      if (collection === "stock") {
        return {
          data: [
            {
              _id: "air-1",
              ticker: "AIR.NZ",
              asset_type: "stock",
              shares: 1,
              purchase_price: 10,
              user: "user-live",
            },
          ],
        };
      }
      return { data: [] };
    });
    getRecordById.mockImplementation(async (collection: string) => {
      order.push(`get:${collection}`);
      await wait(40);
      if (collection === "user") return { data: { cash_balance: 100000 } };
      return { data: { shares: 2 } };
    });
    editRecordById.mockImplementation(async (collection: string) => {
      order.push(`edit-start:${collection}`);
      await wait(80);
      order.push(`edit-end:${collection}`);
      return { data: {} };
    });
    createRecord.mockImplementation(async (collection: string) => {
      order.push(`create-start:${collection}`);
      await wait(80);
      order.push(`create-end:${collection}`);
      return { data: { _id: `${collection}-1`, type: "buy", ticker: "BTC", quantity: 1, price: 20 } };
    });
    const started = Date.now();
    const result = await applyTransaction(
      user,
      {
        type: "buy",
        ticker: "AIR.NZ",
        asset_type: "stock",
        quantity: 1,
        price: 20,
        confirm: true,
        trade_date: "2026-10-12",
      },
      { rejectionChecked: true }
    );
    const elapsed = Date.now() - started;
    console.log(
      `[transactions] confirm measured holdings=${result.confirmSteps?.holdings} quote=${result.confirmSteps?.quote} ledger=${result.confirmSteps?.ledger} cash=${result.confirmSteps?.cash} cache=${result.confirmSteps?.cache} wall=${elapsed}`
    );
    expect(result.holdingId).toBe("air-1");
    expect(result.confirmSteps?.ledger).toBeGreaterThan(0);
    expect(result.confirmSteps?.cash).toBeGreaterThan(0);
    expect(result.confirmSteps?.cache).toBeGreaterThanOrEqual(0);
    const ledgerDone = order.indexOf("create-end:transaction");
    const cashStart = order.indexOf("edit-start:user");
    const shareRead = order.indexOf("get:stock");
    const holdingStart = order.indexOf("edit-start:stock");
    expect(ledgerDone).toBeGreaterThan(-1);
    expect(order.indexOf("create-start:transaction")).toBeLessThan(cashStart);
    expect(shareRead).toBeGreaterThan(-1);
    expect(holdingStart).toBeGreaterThan(-1);
    expect(holdingStart).toBeLessThan(ledgerDone);
    expect(elapsed).toBeLessThan(1000);
    const route = readFileSync("src/app/api/transactions/route.ts", "utf8");
    expect(route).toContain("[transactions] confirm auth=");
    expect(route).toContain("holdings=");
    expect(route).toContain("ledgerPartial");
    expect(route).not.toContain("await priorLedger");
  });

  it("keeps a new coin when a later holdings body does not include it", () => {
    const trade = {
      _id: "tx-pepe",
      type: "buy",
      ticker: "PEPE",
      asset_type: "crypto",
      asset_name: "Pepe",
      quantity: 1000,
      price: 0.00001,
    };
    const painted = applyBookedTradeToHoldings([], trade);
    expect(painted.map((row) => row.ticker)).toEqual(["PEPE"]);
    const stale = retainBookedHolding(painted, [], trade);
    expect(stale.map((row) => row.ticker)).toEqual(["PEPE"]);
    expect(stale[0]?.shares).toBe(1000);
    expect(snapshotOmitsBookedBuy([], trade)).toBe(true);
    expect(snapshotOmitsBookedBuy([{ ticker: "PEPE", quantity: 1000 }], trade)).toBe(false);
    const merged = mergeConfirmIntoLedger(
      { cashBalance: 50, transactions: [{ _id: "old", type: "deposit" }] },
      { cashBalance: 40, transactions: [trade], lastTransaction: trade, ledgerPartial: true }
    );
    expect(merged.transactions?.map((row) => row._id)).toEqual(["tx-pepe", "old"]);
    expect(merged.cashBalance).toBe(40);
  });

  it("deletes an orphan buy ledger row when the holding write fails, and restores the holding when the ledger write fails", async () => {
    query.mockImplementation(async (collection: string) => {
      if (collection === "stock") {
        return {
          data: [{ _id: "air-1", ticker: "AIR.NZ", asset_type: "stock", shares: 1, purchase_price: 10, user: "user-live" }],
        };
      }
      return { data: [] };
    });
    getRecordById.mockImplementation(async (collection: string) => {
      if (collection === "user") return { data: { cash_balance: 100000 } };
      return { data: { shares: 2 } };
    });
    deleteRecordById.mockResolvedValue({ data: {} });
    editRecordById.mockImplementation(async (collection: string) => {
      if (collection === "stock") throw new Error("holding write failed");
      return { data: {} };
    });
    createRecord.mockImplementation(async () => ({ data: { _id: "ledger-buy-1", type: "buy" } }));
    const buy = {
      type: "buy" as const,
      ticker: "AIR.NZ",
      asset_type: "stock" as const,
      quantity: 1,
      price: 20,
      confirm: true,
      trade_date: "2026-10-12",
    };
    await expect(applyTransaction(user, buy, { rejectionChecked: true })).rejects.toThrow("holding write failed");
    expect(deleteRecordById).toHaveBeenCalledWith("transaction", "ledger-buy-1");

    deleteRecordById.mockClear();
    editRecordById.mockReset();
    editRecordById.mockResolvedValue({ data: {} });
    createRecord.mockImplementation(async (collection: string) => {
      if (collection === "transaction") throw new Error("ledger write failed");
      return { data: { _id: "stock-1" } };
    });
    await expect(applyTransaction(user, buy, { rejectionChecked: true })).rejects.toThrow("ledger write failed");
    expect(deleteRecordById).not.toHaveBeenCalled();
    expect(editRecordById).toHaveBeenCalledWith("stock", "air-1", expect.objectContaining({ shares: 1 }));
  });

  it("deletes an orphan sell ledger row when the holding write fails, and restores the holding when the ledger write fails", async () => {
    query.mockImplementation(async (collection: string) => {
      if (collection === "stock") {
        return {
          data: [{ _id: "air-1", ticker: "AIR.NZ", asset_type: "stock", shares: 10, purchase_price: 10, user: "user-live" }],
        };
      }
      return { data: [] };
    });
    getRecordById.mockImplementation(async (collection: string) => {
      if (collection === "user") return { data: { cash_balance: 100000 } };
      return { data: { shares: 9 } };
    });
    deleteRecordById.mockResolvedValue({ data: {} });
    editRecordById.mockImplementation(async (collection: string) => {
      if (collection === "stock") throw new Error("holding write failed");
      return { data: {} };
    });
    createRecord.mockImplementation(async () => ({ data: { _id: "ledger-sell-1", type: "sell" } }));
    const sell = {
      type: "sell" as const,
      ticker: "AIR.NZ",
      asset_type: "stock" as const,
      quantity: 1,
      price: 20,
      confirm: true,
      trade_date: "2026-10-12",
    };
    await expect(applyTransaction(user, sell, { rejectionChecked: true })).rejects.toThrow("holding write failed");
    expect(deleteRecordById).toHaveBeenCalledWith("transaction", "ledger-sell-1");

    deleteRecordById.mockClear();
    editRecordById.mockReset();
    editRecordById.mockResolvedValue({ data: {} });
    createRecord.mockImplementation(async (collection: string) => {
      if (collection === "transaction") throw new Error("ledger write failed");
      return { data: { _id: "stock-1" } };
    });
    await expect(applyTransaction(user, sell, { rejectionChecked: true })).rejects.toThrow("ledger write failed");
    expect(deleteRecordById).not.toHaveBeenCalled();
    expect(editRecordById).toHaveBeenCalledWith("stock", "air-1", expect.objectContaining({ shares: 10 }));
  });
});

describe("retest 13 chains, names, sparkline and clocks", () => {
  it("names verifiable L1s and leaves tokens blank", () => {
    expect(chainForTicker("XDC")).toBe("XDC Network");
    expect(chainForTicker("FLR")).toBe("Flare");
    expect(chainForTicker("BSV")).toBe("Bitcoin SV");
    expect(chainForTicker("CFX")).toBe("Conflux");
    expect(chainForTicker("PI")).toBe("Pi Network");
    expect(chainForTicker("RAY")).toBe("");
    expect(chainForTicker("GNO")).toBe("");
    expect(chainForTicker("OHM")).toBe("");
    expect(chainForTicker("ASTER")).toBe("");
    expect(chainForTicker("JST")).toBe("");
    expect(chainForTicker("BTT")).toBe("");
  });

  it("keeps a CoinGecko name that differs and does not invent one that does not", () => {
    expect(coinDisplayName("USDAI", "USDai")).toBe("USDai");
    expect(coinDisplayName("AUSD", "AUSD")).toBe("AUSD");
    expect(coinDisplayName("BFUSD", "BFUSD")).toBe("BFUSD");
    expect(coinDisplayName("0G", "0G")).toBe("0G");
    expect(coinDisplayName("USDT")).toBe("Tether");
  });

  it("stores the CoinGecko sparkline", () => {
    const rows = coinsFromCoinGeckoMarkets([
      {
        id: "pepe",
        symbol: "pepe",
        name: "Pepe",
        current_price: 0.00001,
        market_cap_rank: 40,
        price_change_percentage_1h_in_currency: 0.2,
        price_change_percentage_24h: 1.1,
        price_change_percentage_7d_in_currency: -3,
        circulating_supply: 1000,
        sparkline_in_7d: { price: [0.000009, 0.00001, 0.000011] },
      },
    ]);
    expect(rows[0]?.sparkline7d).toEqual([0.000009, 0.00001, 0.000011]);
    expect(rows[0]?.change1h).toBe(0.2);
    expect(rows[0]?.circulatingSupply).toBe(1000);
    const markets = readFileSync("src/lib/crypto-keyless-seed.ts", "utf8");
    expect(markets).toContain("sparkline=true");
  });

  it("marks a crypto list delayed after the 10 minute refresh and a DEX list after 5", () => {
    const now = Date.now();
    const eleven = new Date(now - 11 * 60 * 1000).toISOString();
    const four = new Date(now - 4 * 60 * 1000).toISOString();
    const six = new Date(now - 6 * 60 * 1000).toISOString();
    expect(pricesAsAtLabel(eleven, now, SNAPSHOT_REFRESH_MS)).toMatch(/The feed is delayed/);
    expect(pricesAsAtLabel(four, now, DEX_REQUEST_FRESH_MS)).not.toMatch(/The feed is delayed/);
    expect(pricesAsAtLabel(six, now, DEX_REQUEST_FRESH_MS)).toMatch(/The feed is delayed/);
    expect(DEX_REQUEST_FRESH_MS).toBe(5 * 60 * 1000);
  });

  it("hides a price older than 24 hours and reads a spark fullday price", () => {
    const old = stalePriceReason("2026-07-10T00:00:00.000Z", Date.parse("2026-10-12T10:42:00.000Z"));
    expect(old).toMatch(/10 Jul 2026/);
    expect(old).toMatch(/more than 24 hours ago/);
    expect(stalePriceReason(new Date().toISOString())).toBeNull();
    const quote = resolveSparkQuote({ close: [], fulldayPrice: 3.39, previousClose: 3.2, timestamp: [] });
    expect(quote?.price).toBe(3.39);
    const page = readFileSync("src/app/markets/crypto/[id]/page.tsx", "utf8");
    expect(page).toContain("PublicCryptoPrices");
    const view = readFileSync("src/components/dashboard/crypto/CoinDetailView.tsx", "utf8");
    expect(view).toContain("data-coin-snapshot");
    expect(view).toContain("detail.change1h");
    expect(view).toContain("detail.change7d");
    expect(view).toContain("circulatingSupply");
    expect(view).toContain("quoteStaleLabel(detail.quotedAt)");
    expect(view).toContain("stalePriceReason(detail.quotedAt)");
  });

  it("drops a booked buy on delete and stops ignoring snapshots that never contain it", () => {
    const buy = {
      type: "buy",
      ticker: "PEPE",
      asset_type: "crypto",
      quantity: 1000,
      price: 0.00001,
    };
    const started = 1_000;
    const armed = bookedGuardAfterEvent(null, buy, started);
    expect(armed?.trade.ticker).toBe("PEPE");
    const held = [
      { _id: "pepe", ticker: "PEPE", asset_type: "crypto", shares: 1000, purchase_price: 0.00001, current_price: 0.00001 },
      { _id: "bonk", ticker: "BONK", asset_type: "crypto", shares: 5, purchase_price: 1, current_price: 1 },
      { _id: "pepe-share", ticker: "PEPE", asset_type: "stock", shares: 10, purchase_price: 1, current_price: 1 },
    ];
    expect(held.filter((row) => isPendingBookedRow(row, armed?.trade)).map((row) => row._id)).toEqual(["pepe"]);
    expect(snapshotOmitsBookedBuy([{ ticker: "PEPE", quantity: 1000, assetClass: "shares" }], buy)).toBe(true);
    expect(snapshotOmitsBookedBuy([{ ticker: "PEPE", quantity: 1000, assetClass: "crypto" }], buy)).toBe(false);

    const first = reviewBookedSnapshot(armed, [], started + 1_000);
    expect(first.apply).toBe(false);
    expect(first.guard?.reads).toBe(1);
    const deleted = bookedGuardAfterEvent(first.guard, { type: "delete", ticker: "PEPE" }, started + 2_000);
    expect(deleted).toBeNull();
    expect(reviewBookedSnapshot(deleted, [], started + 2_000).apply).toBe(true);
    expect(bookedGuardAfterEvent(armed, { type: "sell", ticker: "PEPE", asset_type: "crypto" }, started)).toBeNull();
    expect(bookedGuardAfterEvent(armed, { type: "correction", ticker: "PEPE" }, started)).toBeNull();
    expect(bookedGuardAfterEvent(armed, { type: "account" }, started)).toBeNull();

    const missing = reviewBookedSnapshot(armed, [], started + 1_000);
    const givenUp = reviewBookedSnapshot(missing.guard, [], started + 2_000);
    expect(givenUp.apply).toBe(true);
    expect(givenUp.guard).toBeNull();
    const expired = reviewBookedSnapshot(armed, [], started + 30_000);
    expect(expired.apply).toBe(true);
    expect(expired.guard).toBeNull();
  });
});
