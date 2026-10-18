import "server-only";

/**
 * Koins full-market intelligence (server-only).
 *
 * The Koins Full Report must cover the COMPLETE cryptocurrency market — not the
 * 18-name core universe used by the deterministic engine. This module fetches
 * the same resilient top-400 list as the Crypto tab (CoinGecko, then Swyftx /
 * Yahoo) plus the public DEX list, and runs every coin through the SAME technical engine the equities
 * board uses (`analyzeSecurity`), producing a full `SecurityIntel[]` spine.
 *
 * This is the data layer that gives Koins genuine feature parity with Stox:
 * market overview, top movers, 7-day projections, buy/sell/hold convictions and
 * specific ticker recommendations — all drawn from the whole crypto market and
 * NEVER mixed with NZX / ASX / NASDAQ / DOW equity data.
 */

import { loadTop400Markets } from "@/lib/crypto-source";
import { readSharedDexBoard } from "@/lib/crypto-board-store";
import { dexRowToCoin } from "@/lib/crypto-dex";
import { analyzeSecurity, NOT_ENOUGH_DAILY_HISTORY, staleDataHold, type SecurityIntel } from "@/lib/market-intel";
import { labelIntel } from "@/lib/security-signal";
import { resolveSevenDayChange, type CoinMarket } from "@/lib/crypto-market";

function round(v: number, dp = 2): number {
  const f = Math.pow(10, dp);
  return Math.round(v * f) / f;
}

function positiveSeries(series: number[] | null | undefined): number[] {
  return (series || []).filter((point) => typeof point === "number" && isFinite(point) && point > 0);
}

/**
 * Convert one live coin into a `SecurityIntel` row.
 *
 * RSI, MACD and regime come only from real daily closes (at least 40 points,
 * such as a CoinGecko market_chart daily series). The hourly sparkline is not
 * a daily series. Real 24h and 7d changes stay. Koins does not publish a
 * 7-day projection, odds, conviction or a bull/base/bear outlook.
 */
export function coinToIntel(c: CoinMarket, dailyCloses?: number[] | null): SecurityIntel {
  const daily = positiveSeries(dailyCloses);
  const series = daily.length >= 40 ? daily : undefined;
  const base = analyzeSecurity(c.symbol, c.price > 0 ? c.price : undefined, c.name, "CRYPTO", series);

  const stated24h = c.moves ? c.moves.h24 : isFinite(c.change24h) ? c.change24h : null;
  const live7d = c.moves ? c.moves.d7 : resolveSevenDayChange(c.change7d, c.sparkline7d);
  const published: Array<"1d" | "7d" | "30d"> = [];
  let change1d = 0;
  let change7d = 0;
  if (stated24h != null && isFinite(stated24h)) {
    change1d = round(stated24h, 2);
    published.push("1d");
  }
  if (live7d != null && isFinite(live7d)) {
    change7d = round(live7d, 2);
    published.push("7d");
  }
  if (daily.length >= 40 && !base.analysisHold) published.push("30d");

  const technicalHold = base.analysisHold ? NOT_ENOUGH_DAILY_HISTORY : null;
  const built: SecurityIntel = {
    ...base,
    ticker: c.symbol,
    name: c.name,
    market: "CRYPTO",
    assetClass: "crypto",
    currency: "USD",
    sector: "Digital Assets",
    price: c.price > 0 ? c.price : base.price,
    change1d,
    change7d,
    change30d: daily.length >= 40 && !base.analysisHold ? base.change30d : 0,
    projected7dPct: 0,
    confidence: 0,
    projection: [],
    outlook: {
      ...base.outlook,
      expectedPct: 0,
      sigma7Pct: 0,
      base: { ...base.outlook.base, lowPct: 0, highPct: 0, lowPrice: 0, highPrice: 0, probability: 0 },
      bull: { ...base.outlook.bull, lowPct: 0, highPct: 0, lowPrice: 0, highPrice: 0, probability: 0 },
      bear: { ...base.outlook.bear, lowPct: 0, highPct: 0, lowPrice: 0, highPrice: 0, probability: 0 },
    },
    conviction: "Low",
    convictionReason: "",
    publishedChanges: published,
    analysisHold: technicalHold,
    forwardOmitted: true,
  };
  return labelIntel(staleDataHold(built, c.quotedAt, new Date(), "crypto"));
}

let cache: { at: number; value: SecurityIntel[] } | null = null;
const TTL_MS = 60_000;

/**
 * Full live cryptocurrency-market technical intel — the COMPLETE top-500 market,
 * each coin run through the equities engine. This is the spine that gives the
 * Koins Full Report full-market parity with Stox and powers the "entire crypto
 * market" leg of the combined Projections sweep. Cached for 60s. Returns `[]` on
 * a total data-source failure so callers can fall back gracefully to the
 * deterministic core universe (the report never goes blank).
 */
async function liveCryptoUniverse(): Promise<CoinMarket[]> {
  const bySymbol = new Map<string, CoinMarket>();
  const take = (coin: CoinMarket) => {
    const key = (coin.symbol || "").toUpperCase();
    if (!key || !(coin.price > 0) || coin.priceUnavailable) return;
    if (!bySymbol.has(key)) bySymbol.set(key, coin);
  };
  try {
    const top = await loadTop400Markets();
    top.coins.forEach(take);
  } catch (err) {
    console.error("[koins-market] crypto sweep failed — held names still stay on the report:", err);
  }
  try {
    const dex = await readSharedDexBoard();
    dex.rows.forEach((row, index) => take(dexRowToCoin(row, 1000 + index)));
  } catch (err) {
    console.error("[koins-market] DEX list unavailable — held names still stay on the report:", err);
  }
  return [...bySymbol.values()];
}

export async function fetchCryptoMarketIntel(limit = 800): Promise<SecurityIntel[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;

  const coins = await liveCryptoUniverse();
  if (!coins.length) return [];

  const intel = coins
    .filter((c) => c && c.symbol && isFinite(c.price) && c.price > 0)
    .slice(0, limit)
    .map((c) => coinToIntel(c));

  console.log(`[koins-market] Built full crypto-market intel for ${intel.length} coins`);
  cache = { at: Date.now(), value: intel };
  return intel;
}
