import { gunzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { withholdAcrossWindows } from "@/lib/bot-report";
import { chainForTicker } from "@/lib/crypto-board";
import { presentMarketCoin } from "@/lib/crypto-api-body";
import {
  chooseSnapshotRaw,
  clearSnapshotMemory,
  installSnapshotDurable,
  joinWatchlistPayload,
  packWatchlistBody,
  persistCryptoSnapshot,
  readCryptoSnapshot,
  resetCryptoSnapshotsForTests,
  snapshotRowCount,
  splitWatchlistPayload,
  WATCHLIST_SNAPSHOT_MAX,
  type SnapshotDurable,
  type SnapshotId,
} from "@/lib/crypto-snapshot";
import { sumRoundedMoney } from "@/lib/currency";
import { preserveQuoteStamp } from "@/lib/dex-source";
import { applyKoinsSweeps, type KoinsCandidate } from "@/lib/koins-quality";
import { coinToIntel } from "@/lib/koins-market";
import type { CoinMarket } from "@/lib/crypto-market";
import { collapseDuplicateHoldings } from "@/lib/portfolio";
import { createQuoteBook, reviewSessionMove } from "@/lib/quote-review";
import type { ApexReport } from "@/lib/bot-report";

function snap(at: string, symbol = "BTC"): string {
  return JSON.stringify({
    at,
    coins: [{ id: symbol.toLowerCase(), symbol, name: symbol, price: 2 }],
  });
}

function candidate(symbol: string, h24: number): KoinsCandidate {
  return {
    symbol,
    name: symbol,
    price: 1,
    moves: { h24, d7: 1, d30: 1 },
  };
}

describe("Testing Technician r3", () => {
  it("keeps a stored crypto snapshot when the colo copy is empty or older", () => {
    const db = snap("2026-10-13T00:00:00.000Z");
    const local = snap("2026-10-12T00:00:00.000Z", "ETH");
    expect(chooseSnapshotRaw("crypto", db, null)).toBe(db);
    expect(chooseSnapshotRaw("crypto", null, local)).toBe(local);
    expect(chooseSnapshotRaw("crypto", db, local)).toBe(db);
    expect(chooseSnapshotRaw("crypto", local, db)).toBe(db);
    expect(chooseSnapshotRaw("crypto", "", local)).toBe(local);
    const at = "2026-10-13T00:00:00.000Z";
    const short = snap(at, "BTC");
    const full = JSON.stringify({
      at,
      n: 3,
      coins: ["BTC", "ETH", "SOL"].map((symbol) => ({ id: symbol.toLowerCase(), symbol, name: symbol, price: 2 })),
    });
    expect(snapshotRowCount("crypto", short)).toBe(1);
    expect(snapshotRowCount("crypto", full)).toBe(3);
    expect(chooseSnapshotRaw("crypto", short, full)).toBe(full);
    expect(chooseSnapshotRaw("crypto", full, short)).toBe(full);
  });

  it("gzips a list that does not fit the watchlist name raw", () => {
    const body = JSON.stringify({ note: "x".repeat(WATCHLIST_SNAPSHOT_MAX) });
    const packed = packWatchlistBody(body);
    expect(packed?.startsWith("z1:")).toBe(true);
    expect((packed || "").length).toBeLessThanOrEqual(WATCHLIST_SNAPSHOT_MAX);
    const raw = gunzipSync(Buffer.from((packed || "").slice(3), "base64")).toString("utf8");
    expect(raw).toBe(body);
  });

  it("fills the seven missing chains and the published coin names", () => {
    expect(chainForTicker("WSTETH")).toBe("Ethereum");
    expect(chainForTicker("USDS")).toBe("Ethereum");
    expect(chainForTicker("XMR")).toBe("Monero");
    expect(chainForTicker("WBT")).toBe("Ethereum");
    expect(chainForTicker("LEO")).toBe("Ethereum");
    expect(chainForTicker("CBBTC")).toBe("Base");
    expect(chainForTicker("RAIN")).toBe("Ethereum");
    const render = presentMarketCoin({ symbol: "RENDER", name: "RENDER", blockchain: "" });
    const dydx = presentMarketCoin({ symbol: "DYDX", name: "DYDX", blockchain: "" });
    expect(render.name).toBe("Render");
    expect(dydx.name).toBe("dYdX");
    expect(presentMarketCoin({ symbol: "WSTETH", name: "Wrapped stETH", blockchain: "" }).blockchain).toBe("Ethereum");
  });

  it("keeps an ordinary week move and withholds a print outside the volatility band on every rank list", () => {
    expect(reviewSessionMove({ ticker: "CNU.NZ", assetClass: "stock", price: 2, reportedChangePct: 20.6, window: "7d" }).withheld).toBe(false);
    expect(reviewSessionMove({ ticker: "TRA.NZ", assetClass: "stock", price: 2, reportedChangePct: 19.3, window: "7d" }).withheld).toBe(false);
    expect(reviewSessionMove({ ticker: "PAYX", assetClass: "stock", price: 20, reportedChangePct: 23.1, window: "7d" }).withheld).toBe(false);
    expect(reviewSessionMove({ ticker: "JPM", assetClass: "stock", price: 210, reportedChangePct: 31.01, window: "7d" }).withheld).toBe(false);
    const book = createQuoteBook();
    book.review({ ticker: "GXH.NZ", assetClass: "stock", price: 1.2, reportedChangePct: 1, window: "1d" });
    expect(book.review({ ticker: "GXH.NZ", assetClass: "stock", price: 1.2, reportedChangePct: 33, window: "7d" }).withheld).toBe(true);
    expect(book.review({ ticker: "GXH.NZ", assetClass: "stock", price: 1.2, reportedChangePct: 4, window: "30d" }).withheld).toBe(true);
    const ranked = withholdAcrossWindows([
      { window: "Last 24 hours", movers: [{ ticker: "GXH.NZ" }, { ticker: "AIR.NZ" }], underReview: [], withheldCount: 0, reviewNote: null },
      { window: "Last 7 days", movers: [{ ticker: "AIR.NZ" }], underReview: [{ ticker: "GXH.NZ" }], withheldCount: 1, reviewNote: "1 print under review" },
      { window: "Last month", movers: [{ ticker: "GXH.NZ" }, { ticker: "AIA.AX" }], underReview: [{ ticker: "AIA.AX" }], withheldCount: 1, reviewNote: "1 print under review" },
    ]);
    expect(ranked[0].movers.map((row) => row.ticker)).toEqual(["AIR.NZ"]);
    expect(ranked[2].movers.map((row) => row.ticker)).toEqual([]);
    expect(ranked[0].underReview.map((row) => row.ticker)).toContain("GXH.NZ");
  });

  it("drops RLC from the 7-day list when it is under review on 30 days, and refills to 10", () => {
    const ranked = withholdAcrossWindows([
      {
        window: "Last 7 days",
        movers: [
          { ticker: "RLC", marketsMatched: true },
          ...Array.from({ length: 12 }, (_, index) => ({ ticker: `C${index}` })),
        ],
        underReview: [],
        withheldCount: 0,
        reviewNote: null,
      },
      {
        window: "Last 30 days",
        movers: [{ ticker: "ADA" }, { ticker: "RLC", marketsMatched: true }],
        underReview: [{ ticker: "RLC" }],
        withheldCount: 1,
        reviewNote: "1 print under review",
      },
    ]);
    expect(ranked[0].movers.map((row) => row.ticker)).not.toContain("RLC");
    expect(ranked[0].movers).toHaveLength(10);
    expect(ranked[0].movers[0]?.ticker).toBe("C0");
    expect(ranked[0].underReview.map((row) => row.ticker)).toContain("RLC");
    expect(ranked[1].movers.map((row) => row.ticker)).toEqual(["ADA"]);
    expect(ranked[1].underReview.map((row) => row.ticker)).toContain("RLC");
  });

  it("names top gainers from the filtered list and does not pin a projection at 45", () => {
    const rows = [
      candidate("RSR", 58.76),
      candidate("W", 47.14),
      ...Array.from({ length: 10 }, (_, index) => candidate(`C${index}`, 1 + index)),
    ];
    const report = {
      bot: "crypto",
      topGainers: [
        { ticker: "RSR", name: "RSR", changePct: 58.76 },
        { ticker: "W", name: "W", changePct: 47.14 },
      ],
      sessionTapeNote: "RSR leads the session (+58.76%) and tops the gainer board.",
      keyObservations: ["RSR leads the session (+58.76%) and tops the gainer board."],
      marketMovers: [
        {
          market: "CRYPTO",
          label: "Crypto",
          windows: [
            { window: "Last 24 hours", movers: [], underReview: [], withheldCount: 0, reviewNote: null },
            { window: "Last 7 days", movers: [], underReview: [], withheldCount: 0, reviewNote: null },
            { window: "Last month", movers: [], underReview: [], withheldCount: 0, reviewNote: null },
          ],
        },
      ],
      projectionLeaders: [],
    } as ApexReport;
    const swept = applyKoinsSweeps(report, { at: "2026-10-13T00:00:00.000Z", candidates: rows, projections: [] }, Date.parse("2026-10-13T00:01:00.000Z"));
    expect(swept.topGainers.some((row) => row.ticker === "RSR" || row.ticker === "W")).toBe(false);
    expect(swept.sessionTapeNote).not.toContain("RSR");
    expect(swept.keyObservations.join(" ")).not.toContain("58.76");
    const hot = {
      id: "reserve-rights",
      symbol: "RSR",
      name: "Reserve Rights",
      image: "",
      rank: 80,
      price: 0.005,
      marketCap: 1,
      fdv: null,
      volume24h: 1,
      change1h: null,
      change24h: 20,
      change7d: 80,
      high24h: null,
      low24h: null,
      circulatingSupply: null,
      totalSupply: null,
      maxSupply: null,
      ath: null,
      athDate: null,
      atl: null,
      atlDate: null,
      sparkline7d: [],
      blockchain: "",
      priceUnavailable: false,
      moves: { h24: 20, d7: 80, d30: null },
    } as CoinMarket;
    const intel = coinToIntel(hot);
    expect(intel.projected7dPct).not.toBe(45);
    expect(Math.abs(intel.projected7dPct)).toBeLessThanOrEqual(12);
  });

  it("sums rounded cents and keeps stamps when the user note is 600 characters", () => {
    expect(sumRoundedMoney([10.004, 10.004])).toBe(20);
    expect(sumRoundedMoney([10.005, 10.005])).toBe(20.02);
    const user = "u".repeat(600);
    const audit = "[audit 12 Oct 2026, 3:00 pm] FILLED buy qty=1 fill=2 NZD live=20.01 source=user_fill.";
    const note = preserveQuoteStamp(`${user} idem=trade-key-600 ${audit}`, "Ethereum", "2026-10-12T10:52:00.000Z");
    expect(note.length).toBeLessThanOrEqual(4000);
    expect(note).toContain("idem=trade-key-600");
    expect(note).toContain("live=20.01");
    expect(note).toContain("chain=Ethereum");
    expect(note).toContain("pxat=2026-10-12T10:52:00.000Z");
    expect(note).toContain("FILLED buy qty=1");
    expect(note).toContain("source=user_fill");
    expect(note).toContain(user);
  });

  it("keeps separate lots of 10+10 and 5+3+2, and drops a repeated row or an aggregate", () => {
    const ten = collapseDuplicateHoldings([
      { _id: "a", ticker: "BTC", asset_type: "crypto", shares: 10 },
      { _id: "b", ticker: "BTC", asset_type: "crypto", shares: 10 },
    ]);
    expect(ten.map((row) => row.shares)).toEqual([10, 10]);
    const mixed = collapseDuplicateHoldings([
      { _id: "p", ticker: "ETH", asset_type: "crypto", shares: 5 },
      { _id: "q", ticker: "ETH", asset_type: "crypto", shares: 3 },
      { _id: "r", ticker: "ETH", asset_type: "crypto", shares: 2 },
    ]);
    expect(mixed.map((row) => row.shares)).toEqual([5, 3, 2]);
    const sameId = collapseDuplicateHoldings([
      { _id: "a", ticker: "BTC", asset_type: "crypto", shares: 10 },
      { _id: "a", ticker: "BTC", asset_type: "crypto", shares: 10 },
    ]);
    expect(sameId).toHaveLength(1);
    const copied = collapseDuplicateHoldings(
      [
        { _id: "a", ticker: "BTC", asset_type: "crypto", shares: 10 },
        { _id: "b", ticker: "BTC", asset_type: "crypto", shares: 10 },
      ],
      { BTC: 10 }
    );
    expect(copied).toHaveLength(1);
    const aggregate = collapseDuplicateHoldings(
      [
        { _id: "sum", ticker: "AAPL", asset_type: "stock", shares: 10 },
        { _id: "lot1", ticker: "AAPL", asset_type: "stock", shares: 6 },
        { _id: "lot2", ticker: "AAPL", asset_type: "stock", shares: 4 },
      ],
      { AAPL: 10 }
    );
    expect(aggregate.map((row) => row._id)).toEqual(["lot1", "lot2"]);
  });

  it("reads the stored notice for the public source line and does not seed a confirm price", () => {
    const page = readFileSync("src/lib/public-market-index.ts", "utf8");
    expect(page).toContain("fmtCompactNum(coin.circulatingSupply)");
    expect(page).toContain("page.notice");
    expect(page).toContain("page.sources[0]");
    expect(page).not.toContain('source: "geckoterminal"');
    const price = readFileSync("src/lib/crypto-board-store.ts", "utf8");
    const confirm = price.slice(price.indexOf("export async function priceFromSnapshot"));
    expect(confirm).toContain("readCryptoSnapshot()");
    expect(confirm).not.toContain("refreshCryptoSeed");
    const book = readFileSync("src/lib/transactions.ts", "utf8");
    expect(book).toContain("preserveQuoteStamp");
    expect(book).not.toContain("Promise.all([tracked, cashWrite, shareRead])");
    const markets = readFileSync("src/lib/crypto-source.ts", "utf8");
    const loadTop = markets.slice(markets.indexOf("export async function loadTop400Markets"));
    expect(loadTop).toContain("storedListNeedsUpgrade");
    expect(markets).toContain("coins.length < 300");
    expect(markets).toContain("8_000");
    const snapSrc = readFileSync("src/lib/crypto-snapshot.ts", "utf8");
    const readRaw = snapSrc.slice(snapSrc.indexOf("async function readRaw"), snapSrc.indexOf("async function writeRaw"));
    expect(readRaw).toContain("durableOverride");
    expect(readRaw).not.toContain("return withTimeout(read, timeoutMs)");
    const dbRead = snapSrc.slice(snapSrc.indexOf("async function defaultRead"), snapSrc.indexOf("async function defaultWrite"));
    expect(dbRead).toContain("SNAPSHOT_DB_TIMEOUT_MS");
    expect(dbRead.indexOf("fromLocal")).toBeLessThan(dbRead.indexOf("SNAPSHOT_DB_TIMEOUT_MS"));
  });

  it("stores all 400 coins in compact chunks and stamps the row count", async () => {
    const store = new Map<SnapshotId, string>();
    const durable: SnapshotDurable = {
      async read(id) {
        return store.get(id) ?? null;
      },
      async write(id, body) {
        store.set(id, body);
        return true;
      },
    };
    installSnapshotDurable(durable);
    const coins = Array.from({ length: 400 }, (_, index) => ({
      id: `coin-${index}`,
      symbol: `C${index}`,
      name: `Coin ${index} display name`,
      image: "",
      rank: index + 1,
      price: Number((0.000123456 * (index + 1)).toFixed(12)),
      marketCap: 1_000_000_000 - index,
      fdv: null,
      volume24h: 12345.678,
      change1h: null,
      change24h: 1.23456,
      change7d: -2.2,
      high24h: null,
      low24h: null,
      circulatingSupply: null,
      totalSupply: null,
      maxSupply: null,
      ath: null,
      athDate: null,
      atl: null,
      atlDate: null,
      sparkline7d: [],
      blockchain: "Ethereum",
      priceUnavailable: false,
      source: "coingecko",
      quotedAt: "2026-10-13T00:00:00.000Z",
    }));
    await persistCryptoSnapshot(coins, "2026-10-13T00:00:00.000Z");
    const stored = store.get("crypto") || "";
    expect(stored).toContain('"n":400');
    expect(stored).not.toContain('"marketCap"');
    clearSnapshotMemory();
    const again = await readCryptoSnapshot(50);
    expect(again?.coins).toHaveLength(400);
    expect(again?.coins[0].blockchain).toBe("Ethereum");
    const split = splitWatchlistPayload(stored, 2_000);
    expect(split?.chunks.length).toBeGreaterThan(1);
    const joined = split ? joinWatchlistPayload(split.header, split.chunks) : null;
    expect(snapshotRowCount("crypto", joined)).toBe(400);
    for (const part of [split?.header, ...(split?.chunks || [])]) {
      expect((part || "").length).toBeLessThanOrEqual(2_000);
    }
    const fitted = splitWatchlistPayload(stored);
    expect(snapshotRowCount("crypto", fitted ? joinWatchlistPayload(fitted.header, fitted.chunks) : null)).toBe(400);
    resetCryptoSnapshotsForTests();
  });
});
