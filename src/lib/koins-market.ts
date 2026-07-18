import "server-only";

/**
 * Koins full-market intelligence (server-only).
 *
 * The Koins Full Report must cover the COMPLETE cryptocurrency market — not the
 * 18-name core universe used by the deterministic engine. This module fetches
 * the live top-500 market (Swyftx primary via SWYFTX_API_KEY, CoinGecko
 * fallback) and runs every coin through the SAME technical engine the equities
 * board uses (`analyzeSecurity`), producing a full `SecurityIntel[]` spine.
 *
 * This is the data layer that gives Koins genuine feature parity with Stox:
 * market overview, top movers, 7-day projections, buy/sell/hold convictions and
 * specific ticker recommendations — all drawn from the whole crypto market and
 * NEVER mixed with NZX / ASX / NASDAQ / DOW equity data.
 */

import { getTop500 } from "@/lib/crypto-source";
import { analyzeSecurity, type SecurityIntel } from "@/lib/market-intel";
import type { CoinMarket } from "@/lib/crypto-market";

function round(v: number, dp = 2): number {
  const f = Math.pow(10, dp);
  return Math.round(v * f) / f;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Convert one live top-500 coin into a full `SecurityIntel` row.
 *
 * The deterministic technical engine provides the structural read — RSI, MACD,
 * SMAs, regime, support/resistance, conviction — anchored to the coin's LIVE USD
 * price. We then overwrite the realised 24h / 7d moves with the exchange's
 * GENUINE figures and blend a transparent, bounded forward 7-day projection from
 * real momentum + the model's structural bias, so the board ranks on true market
 * performance. Market/asset-class/currency are FORCED to crypto so a symbol that
 * happens to collide with an equity ticker can never mislabel the row.
 */
export function coinToIntel(c: CoinMarket): SecurityIntel {
  const base = analyzeSecurity(c.symbol, c.price > 0 ? c.price : undefined, c.name, "CRYPTO");

  const change1d = isFinite(c.change24h) ? round(c.change24h, 2) : base.change1d;
  const change7d = isFinite(c.change7d) ? round(c.change7d, 2) : base.change7d;

  // Forward 7-day projection: continuation of REAL momentum, damped for
  // mean-reversion, tempered by the model's structural read. Bounded so a single
  // vertical pump can't dominate the ranking with an implausible number.
  const projected7dPct = round(
    clamp(0.5 * base.projected7dPct + 0.4 * change7d + 0.1 * change1d, -45, 70),
    2
  );

  return {
    ...base,
    ticker: c.symbol,
    name: c.name,
    market: "CRYPTO",
    assetClass: "crypto",
    currency: "USD",
    sector: "Digital Assets",
    price: c.price,
    change1d,
    change7d,
    projected7dPct,
  };
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
export async function fetchCryptoMarketIntel(limit = 500): Promise<SecurityIntel[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;

  let coins: CoinMarket[] = [];
  try {
    coins = await getTop500();
  } catch (err) {
    console.error("[koins-market] getTop500 failed — full crypto-market intel unavailable:", err);
    return [];
  }

  const intel = coins
    .filter((c) => c && c.symbol && isFinite(c.price) && c.price > 0)
    .slice(0, limit)
    .map((c) => coinToIntel(c));

  console.log(`[koins-market] Built full crypto-market intel for ${intel.length} coins (live top-500 sweep)`);
  cache = { at: Date.now(), value: intel };
  return intel;
}
