import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";

import type { ApexReport } from "@/lib/bot-report";
import { chainForTicker, coingeckoSupplied, dexRowComplete, snapshotBlockchain } from "@/lib/crypto-board";
import { MARKET_USER_AGENT, coinGeckoEndpoint } from "@/lib/coingecko-auth";
import {
  installSeedFetch,
  loadKeylessCryptoMarkets,
  resetSeedFetch,
  type SeedFetch,
} from "@/lib/crypto-keyless-seed";
import { coinDisplayName } from "@/lib/crypto-names";
import { pageTitle } from "@/lib/page-title";
import { applyKoinsSweeps, rankGainers, type KoinsCandidate } from "@/lib/koins-quality";
import { lastGoodUnitPrice } from "@/lib/metal-valuation";
import { reviewSessionMove } from "@/lib/quote-review";
import { tickerCallSentence } from "@/lib/report-topup";
import { fifoCsvFigures, transactionCsvCells } from "@/lib/transaction-csv";
import { koinsUnavailableLine } from "@/lib/crypto-board";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function candidate(symbol: string, move: number, agree?: number | null): KoinsCandidate {
  return {
    symbol,
    name: symbol,
    price: 1,
    moves: { h24: move, d7: move, d30: move },
    agree: agree == null ? null : { h24: agree, d7: agree, d30: agree },
  };
}

afterEach(() => {
  resetSeedFetch();
  delete process.env.COINCAP_API_KEY;
});

describe("pull-check:v3-retest-tt-2026-10-12", () => {
  it("marks the retest build", () => {
    expect(read("qa/PULL-CHECK-2026-10-12.md")).toContain("pull-check:v3-retest-tt-2026-10-12");
    expect(read("public/build-version.txt").trim()).toBe("v3-goal-b9-2026-10-18");
    expect(read("src/app/api/crypto/route.ts")).toContain("readSharedCryptoBoard");
    expect(pageTitle("About — Built in New Zealand, for New Zealanders")).toBe(
      "About — Built in New Zealand, for New Zealanders — AetherForge AI"
    );
  });

  it("sends an app user-agent and skips CoinCap unless a key is set", async () => {
    expect(coinGeckoEndpoint().headers["user-agent"]).toBe(MARKET_USER_AGENT);
    const urls: string[] = [];
    const fetcher: SeedFetch = async (url, init) => {
      urls.push(String(url));
      const headers = init?.headers as Record<string, string> | undefined;
      expect(headers?.["user-agent"]).toContain("AetherForgeAI/1.0");
      if (String(url).includes("coinpaprika.com")) {
        return new Response(
          JSON.stringify(
            Array.from({ length: 45 }, (_, index) => ({
              id: `c${index}-coin-${index}`,
              symbol: `C${index}`,
              name: `Coin ${index}`,
              rank: index + 1,
              last_updated: "2026-10-12T01:00:00Z",
              quotes: { USD: { price: index + 1, market_cap: 1_000, volume_24h: 10, percent_change_24h: 1 } },
            }))
          ),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      return new Response("[]", { status: 429 });
    };
    installSeedFetch(fetcher);
    const coins = await loadKeylessCryptoMarkets({ budgetMs: 1_500 });
    expect(coins.length).toBeGreaterThanOrEqual(40);
    expect(urls.some((url) => url.includes("coincap.io"))).toBe(false);
    expect(coingeckoSupplied(["yahoo"])).toBe(false);
    expect(coingeckoSupplied(["coingecko", "yahoo"])).toBe(true);
  });

  it("names Yahoo tickers and fills a chain for the top coins", () => {
    expect(coinDisplayName("USDT")).toBe("Tether");
    expect(coinDisplayName("ADA")).toBe("Cardano");
    expect(coinDisplayName("SUI")).toBe("Sui");
    expect(coinDisplayName("WIF")).toBe("dogwifhat");
    expect(coinDisplayName("USDC")).toBe("USDC");
    expect(coinDisplayName("BNB")).toBe("BNB");
    expect(coinDisplayName("XRP")).toBe("XRP");
    const raw = ["USDT", "SUI", "ETC", "VET", "RENDER", "IMX", "STX", "GRT", "RUNE", "EGLD", "XTZ", "SAND", "MANA", "QNT", "LDO", "COMP", "DYDX", "ENS", "CHZ", "ZEC", "CAKE", "KAVA", "LRC", "DASH", "SUSHI", "CELO", "SKL", "STORJ", "AUDIO", "MASK", "BAND", "BAL", "1INCH", "LUNC", "WIF", "PENDLE", "PYTH", "BLUR"];
    for (const ticker of raw) expect(coinDisplayName(ticker)).not.toBe(ticker);
    expect(snapshotBlockchain("cardano", null)).toBe("Cardano");
    expect(chainForTicker("ADA")).toBe("Cardano");
    expect(chainForTicker("BTC")).toBe("Bitcoin");
    expect(chainForTicker("ETH")).toBe("Ethereum");
    expect(chainForTicker("SOL")).toBe("Solana");
    expect(snapshotBlockchain("sui", null)).toBe("Sui");
  });

  it("withholds implausible 7-day equity moves and keeps JPM under the large-cap cap", () => {
    expect(reviewSessionMove({ ticker: "GXH.NZ", assetClass: "stock", price: 1.2, reportedChangePct: 33, window: "7d" }).withheld).toBe(true);
    expect(reviewSessionMove({ ticker: "FLT.AX", assetClass: "stock", price: 20, reportedChangePct: 41, window: "7d" }).withheld).toBe(true);
    expect(reviewSessionMove({ ticker: "AIA.AX", assetClass: "stock", price: 8, reportedChangePct: 59, window: "7d" }).withheld).toBe(true);
    expect(reviewSessionMove({ ticker: "JPM", assetClass: "stock", price: 210, reportedChangePct: 31.01, window: "7d" }).withheld).toBe(false);
  });

  it("says the month is unavailable at zero gainers and drops doubtful outliers", () => {
    const fresh = "2026-10-12T03:05:00.000Z";
    const losers = Array.from({ length: 12 }, (_, index) => candidate(`Z${index}`, -1));
    const none = applyKoinsSweeps(
      { bot: "crypto", marketMovers: [{ market: "CRYPTO", label: "Crypto", windows: [] }], projectionLeaders: [] } as unknown as ApexReport,
      { at: fresh, candidates: losers, projections: [] },
      Date.parse(fresh) + 60_000
    );
    expect(none.marketMovers[0].windows[2].reviewNote).toBe(koinsUnavailableLine(fresh));
    expect(none.marketMovers[0].windows[2].reviewNote).not.toContain("Only 0");
    expect(none.marketMovers[0].windows[2].movers).toEqual([]);

    const month = rankGainers(
      [
        candidate("AAA", 45),
        candidate("BBB", 45),
        candidate("W", 77.5),
        candidate("RLC", 111),
        candidate("OK", 4),
        ...Array.from({ length: 8 }, (_, index) => candidate(`D${index}`, 1 + index / 10)),
      ],
      "30d"
    );
    expect(month.movers.map((row) => row.ticker)).not.toEqual(expect.arrayContaining(["AAA", "BBB", "W", "RLC"]));
    expect(month.movers.map((row) => row.ticker)).toContain("OK");

    const agreed = rankGainers([candidate("W", 77.5, 78), ...Array.from({ length: 10 }, (_, index) => candidate(`E${index}`, 1))], "30d");
    expect(agreed.movers.map((row) => row.ticker)).toContain("W");
  });

  it("rounds each CSV realised row to the FIFO total", () => {
    const figures = fifoCsvFigures(0.01, 0.01, 0.03);
    expect(figures.total).toBe("0.03");
    expect(Number(figures.price) + Number(figures.fx)).toBeCloseTo(0.03, 2);
    const row = {
      type: "sell",
      ticker: "ADA",
      asset_type: "crypto",
      executed_at: "2026-10-12T01:02:03.000Z",
      quantity: 1,
      price: 1,
      realized_price_pnl_nzd: 0.01,
      realized_fx_pnl_nzd: 0.01,
      realized_pnl_nzd: 0.03,
      notes: "chain=Cardano pxat=2026-10-12T01:02:03.000Z",
      price_as_at: "",
    };
    const cells = transactionCsvCells(row);
    expect(cells[22]).toBe("0.03");
    expect(Number(cells[20]) + Number(cells[21])).toBeCloseTo(0.03, 2);
    expect(cells[26]).toBe("Cardano");
    expect(cells[12]).not.toBe("not stored");
    const old = transactionCsvCells({ ...row, notes: "", price_as_at: "" });
    expect(old[26]).toBe("Cardano");
    expect(old[12]).toBe("not stored");
    expect(
      dexRowComplete({
        id: "x",
        symbol: "ADA",
        name: "Cardano",
        price: 1,
        priceUnavailable: false,
        volume24h: 1,
        network: "",
        dex: "",
        detailId: null,
        address: "",
      })
    ).toBe(false);
  });

  it("drops HOLD sizing and values a missing live print at the last good price", () => {
    const line = tickerCallSentence(
      {
        ticker: "BTC",
        name: "Bitcoin",
        price: 1,
        changePct: 0,
        signal: "Hold",
        sentiment: 50,
        momentum: [],
        momentum12moPct: 0,
        shortTerm: [],
        pathways: [],
        note: "",
      },
      7891.31,
      0
    );
    expect(line).toContain("No new size: HOLD.");
    expect(line).not.toContain("Illustrated size");
    expect(lastGoodUnitPrice(0, 0, 12.5)).toBe(12.5);
    expect(lastGoodUnitPrice(4, 9, 12.5)).toBe(4);
    expect(lastGoodUnitPrice(null, 9, 12.5)).toBe(9);
  });
});
