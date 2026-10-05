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
import { fetchDexTop400 } from "@/lib/crypto-coingecko";
import { dexRowToCoin } from "@/lib/crypto-dex";
import { analyzeSecurity, type SecurityIntel } from "@/lib/market-intel";
import { resolveSevenDayChange, type CoinMarket } from "@/lib/crypto-market";

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
  // A literal 0 with no sparkline is a missing window, not a flat week. Do not
  // overwrite the engine's 7-day change with that placeholder.
  const live7d = resolveSevenDayChange(c.change7d, c.sparkline7d);
  const change7d = live7d != null ? round(live7d, 2) : base.change7d;

  // Forward 7-day projection: continuation of REAL momentum when we have it.
  // Without a live 7-day print, keep the structural read inside a tight band so
  // a seeded walk cannot print a +27% "model" move.
  const projected7dPct =
    live7d == null
      ? round(clamp(base.projected7dPct, -12, 12), 2)
      : round(clamp(0.5 * base.projected7dPct + 0.4 * change7d + 0.1 * change1d, -45, 45), 2);

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
    const dex = await fetchDexTop400();
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
