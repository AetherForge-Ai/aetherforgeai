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

import { applyBookedTradeToHoldings, retainBookedHolding, snapshotOmitsBookedBuy } from "@/lib/apply-booked-trade";
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
  it("writes the ledger before cash, skips the share re-read, and stays under three write waves", async () => {
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
      return { data: { shares: 99 } };
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
    expect(order.filter((step) => step === "get:stock")).toEqual([]);
    const ledgerDone = order.indexOf("create-end:transaction");
    const cashStart = order.indexOf("edit-start:user");
    const holdingStart = order.indexOf("edit-start:stock");
    expect(ledgerDone).toBeGreaterThan(-1);
    expect(cashStart).toBeGreaterThan(ledgerDone);
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
    expect(page).toContain("data-coin-snapshot");
    expect(page).toContain("fmtPct(loaded.initialDetail.change1h)");
    expect(page).toContain("fmtPct(loaded.initialDetail.change7d)");
    expect(page).toContain("circulatingSupply");
  });
});
