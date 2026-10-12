import { gunzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { withholdAcrossWindows } from "@/lib/apex";
import { chainForTicker } from "@/lib/crypto-board";
import { presentMarketCoin } from "@/lib/crypto-api-body";
import { chooseSnapshotRaw, packWatchlistBody, WATCHLIST_SNAPSHOT_MAX } from "@/lib/crypto-snapshot";
import { sumRoundedMoney } from "@/lib/currency";
import { preserveQuoteStamp } from "@/lib/dex-source";
import { applyKoinsSweeps, type KoinsCandidate } from "@/lib/koins-quality";
import { coinToIntel } from "@/lib/koins-market";
import type { CoinMarket } from "@/lib/crypto-market";
import { collapseDuplicateHoldings } from "@/lib/portfolio";
import { createQuoteBook, reviewSessionMove } from "@/lib/quote-review";
import type { ApexReport } from "@/lib/apex";

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

  it("withholds a non-large-cap week move above 15 percent on every rank list", () => {
    expect(reviewSessionMove({ ticker: "CNU.NZ", assetClass: "stock", price: 2, reportedChangePct: 20.6, window: "7d" }).withheld).toBe(true);
    expect(reviewSessionMove({ ticker: "TRA.NZ", assetClass: "stock", price: 2, reportedChangePct: 19.3, window: "7d" }).withheld).toBe(true);
    expect(reviewSessionMove({ ticker: "PAYX", assetClass: "stock", price: 20, reportedChangePct: 23.1, window: "7d" }).withheld).toBe(true);
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

  it("sums rounded cents and keeps chain and pxat at the front of a short note", () => {
    expect(sumRoundedMoney([10.004, 10.004])).toBe(20);
    expect(sumRoundedMoney([10.005, 10.005])).toBe(20.02);
    const note = preserveQuoteStamp(`${"n".repeat(470)} live=20.01 chain=Later pxat=later`, "Ethereum", "2026-10-12T10:52:00.000Z");
    expect(note.startsWith("chain=Ethereum pxat=2026-10-12T10:52:00.000Z live=20.01")).toBe(true);
    expect(note.length).toBeLessThanOrEqual(500);
    expect(note).toContain("live=20.01");
  });

  it("collapses a duplicated lot and an aggregate row, and keeps two real lots", () => {
    const copies = collapseDuplicateHoldings([
      { _id: "a", ticker: "BTC", asset_type: "crypto", shares: 2 },
      { _id: "b", ticker: "BTC", asset_type: "crypto", shares: 2 },
    ]);
    expect(copies).toHaveLength(1);
    const aggregate = collapseDuplicateHoldings([
      { _id: "sum", ticker: "AAPL", asset_type: "stock", shares: 10 },
      { _id: "lot1", ticker: "AAPL", asset_type: "stock", shares: 6 },
      { _id: "lot2", ticker: "AAPL", asset_type: "stock", shares: 4 },
    ]);
    expect(aggregate.map((row) => row._id)).toEqual(["sum"]);
    const lots = collapseDuplicateHoldings([
      { _id: "p", ticker: "ETH", asset_type: "crypto", shares: 1 },
      { _id: "q", ticker: "ETH", asset_type: "crypto", shares: 3 },
    ]);
    expect(lots).toHaveLength(2);
  });

  it("reads the stored notice for the public source line and does not seed a confirm price", () => {
    const page = readFileSync("src/lib/public-market-index.ts", "utf8");
    expect(page).toContain("page.notice");
    expect(page).toContain("page.sources[0]");
    expect(page).not.toContain('source: "geckoterminal"');
    const price = readFileSync("src/lib/crypto-board-store.ts", "utf8");
    const confirm = price.slice(price.indexOf("export async function priceFromSnapshot"));
    expect(confirm).toContain("readCryptoSnapshot()");
    expect(confirm).not.toContain("refreshCryptoSeed");
    const book = readFileSync("src/lib/transactions.ts", "utf8");
    expect(book).toContain("preserveQuoteStamp");
    expect(book).toContain("Promise.all([tracked, cashWrite, shareRead])");
  });
});
