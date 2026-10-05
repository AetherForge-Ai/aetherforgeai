/**
 * Crypto data source selector (server-only).
 *
 * Cascade (never leave the Crypto tab dark):
 *   1) Swyftx (user exchange)
 *   2) CoinGecko (may 429 keyless)
 *   3) Yahoo Finance major-coin fallback
 *
 * Id namespaces: Swyftx/Yahoo use short codes ("btc"); CoinGecko uses slugs
 * ("bitcoin"). Fallback paths remap via canonicalCryptoId.
 */

import "server-only";
import * as swyftx from "@/lib/crypto-swyftx";
import * as coingecko from "@/lib/crypto-coingecko";
import * as yahoo from "@/lib/crypto-yahoo";
import {
  coinHasLivePrice,
  coinLogo,
  LIVE_CRYPTO_UNAVAILABLE,
  mergeSevenDayChanges,
  rankedFallbackPage,
  resolveSevenDayChange,
  sevenDayBoardIsMissing,
  type CoinMarket,
  type CoinDetail,
  type CoinChart,
} from "@/lib/crypto-market";
import { canonicalCryptoId, normalizeCryptoTicker } from "@/lib/crypto-ids";

type RankedCryptoPage = Awaited<ReturnType<typeof coingecko.fetchTop400>>;

function toCgId(id: string): string {
  const t = normalizeCryptoTicker(id);
  // Already a coingecko slug?
  if (id.includes("-") || id.length > 6) return id.toLowerCase();
  return canonicalCryptoId(t);
}

const MIN_CRYPTO_UNIVERSE = 100;

function coinKey(c: CoinMarket): string {
  return (c.symbol || c.id || "").toUpperCase();
}

/** Keep the first copy of each symbol, ordered by market-cap rank. */
function mergeByRank(lists: CoinMarket[][]): CoinMarket[] {
  const seen = new Set<string>();
  const out: CoinMarket[] = [];
  for (const list of lists) {
    for (const coin of list) {
      const key = coinKey(coin);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(coin);
    }
  }
  return out.sort((a, b) => (a.rank ?? 999999) - (b.rank ?? 999999));
}

const PINNED_COINS: { symbol: string; id: string; name: string }[] = [
  { symbol: "JUP", id: "jupiter-exchange-solana", name: "Jupiter" },
];

/** Keep Jupiter (and any future pins) in the selector even if a feed omits them. */
async function ensurePinnedCoins(coins: CoinMarket[]): Promise<CoinMarket[]> {
  const have = new Set(coins.map((c) => (c.symbol || "").toUpperCase()));
  const missing = PINNED_COINS.filter((p) => !have.has(p.symbol));
  if (!missing.length) return coins;
  const extras: CoinMarket[] = [];
  for (const pin of missing) {
    try {
      const quote = await yahoo.fetchYahooCryptoQuote(pin.symbol);
      if (!quote || !(quote.price > 0)) continue;
      extras.push({
        id: pin.id,
        symbol: pin.symbol,
        name: pin.name,
        image: coinLogo(pin.symbol),
        rank: 90,
        price: quote.price,
        marketCap: 0,
        fdv: null,
        volume24h: 0,
        change1h: null,
        change24h: quote.changePct,
        change7d: quote.change7d ?? 0,
        sparkline7d: quote.sparkline7d ?? [],
        high24h: null,
        low24h: null,
        circulatingSupply: null,
        totalSupply: null,
        maxSupply: null,
        ath: null,
        athDate: null,
        atl: null,
        atlDate: null,
      });
    } catch (err) {
      console.error(`[crypto-source] pinned ${pin.symbol} lookup failed:`, err);
    }
  }
  return extras.length ? mergeByRank([coins, extras]) : coins;
}

/**
 * Swyftx only sparks the top handful of coins and writes 0 for everyone else.
 * When that leaves the 7-day column flat, fill it from CoinGecko sparklines
 * (or CoinGecko's own 7-day percentage) matched by symbol.
 */
async function hydrateSevenDay(coins: CoinMarket[]): Promise<CoinMarket[]> {
  const primed = coins.map((c) => {
    const pct = resolveSevenDayChange(c.change7d, c.sparkline7d);
    return pct == null ? c : { ...c, change7d: pct };
  });
  if (!sevenDayBoardIsMissing(primed)) return primed;
  try {
    const cg = await coingecko.fetchTop500();
    const merged = mergeSevenDayChanges(primed, cg);
    const filled = merged.filter((c) => resolveSevenDayChange(c.change7d, c.sparkline7d) != null).length;
    console.log(`[crypto-source] 7-day backfill ${filled}/${merged.length} coins via CoinGecko`);
    return merged;
  } catch (err) {
    console.error("[crypto-source] 7-day backfill failed:", err);
    return primed;
  }
}

export async function getTop500(): Promise<CoinMarket[]> {
  const parts: CoinMarket[][] = [];

  try {
    const coins = await swyftx.fetchTop500();
    if (coins && coins.length > 0) {
      console.log(`[crypto-source] top500 via Swyftx (${coins.length})`);
      if (coins.length >= MIN_CRYPTO_UNIVERSE) return hydrateSevenDay(await ensurePinnedCoins(coins));
      parts.push(coins);
    } else {
      throw new Error("Swyftx returned an empty market list");
    }
  } catch (err) {
    console.error("[crypto-source] Swyftx top500 failed — trying CoinGecko:", err);
  }

  if (mergeByRank(parts).length < MIN_CRYPTO_UNIVERSE) {
    try {
      const coins = await coingecko.fetchTop500();
      if (coins && coins.length > 0) {
        console.log(`[crypto-source] top500 via CoinGecko (${coins.length})`);
        parts.push(coins);
        if (mergeByRank(parts).length >= MIN_CRYPTO_UNIVERSE && parts.length === 1) {
          return hydrateSevenDay(await ensurePinnedCoins(coins));
        }
      } else {
        throw new Error("CoinGecko returned an empty market list");
      }
    } catch (err) {
      console.error("[crypto-source] CoinGecko top500 failed — Yahoo major fallback:", err);
    }
  }

  if (mergeByRank(parts).length < MIN_CRYPTO_UNIVERSE) {
    const y = await yahoo.fetchYahooMajorMarkets();
    if (y.length) {
      console.log(`[crypto-source] topping up via Yahoo major (${y.length})`);
      parts.push(y);
    }
  }

  const merged = mergeByRank(parts);
  if (!merged.length) throw new Error("All crypto market sources failed (Swyftx, CoinGecko, Yahoo)");
  console.log(`[crypto-source] crypto universe → ${merged.length} coins`);
  return hydrateSevenDay(await ensurePinnedCoins(merged));
}

let lastGoodTop400: RankedCryptoPage | null = null;

/**
 * Top 400 for the Crypto tab and the Koins sweep.
 * CoinGecko first. When that rate-limits or fails, the existing Swyftx → CoinGecko → Yahoo
 * sweep supplies real prices. The last good list is only used when every live source fails.
 * Prices are never filled in.
 */
export async function loadTop400Markets(): Promise<RankedCryptoPage> {
  try {
    const page = await coingecko.fetchTop400();
    if (page.coins.some(coinHasLivePrice)) {
      lastGoodTop400 = page;
      return page;
    }
    console.error("[crypto-source] CoinGecko top 400 had no live prices");
  } catch (err) {
    console.error("[crypto-source] CoinGecko top 400 failed — using the existing sweep:", err);
  }

  try {
    const fallback = rankedFallbackPage(await getTop500());
    if (fallback.coins.length) {
      lastGoodTop400 = fallback;
      console.log(`[crypto-source] top 400 via existing sweep (${fallback.coins.length})`);
      return fallback;
    }
  } catch (err) {
    console.error("[crypto-source] existing crypto sweep failed:", err);
  }

  if (lastGoodTop400?.coins.length) {
    console.error("[crypto-source] serving the last good crypto list");
    return lastGoodTop400;
  }
  throw new Error(LIVE_CRYPTO_UNAVAILABLE);
}

export async function getCoinDetail(id: string): Promise<CoinDetail> {
  const code = normalizeCryptoTicker(id);
  try {
    return await swyftx.fetchCoinDetail(code);
  } catch (err) {
    console.error(`[crypto-source] Swyftx detail(${id}) failed:`, err);
  }
  try {
    return await coingecko.fetchCoinDetail(toCgId(id));
  } catch (err) {
    console.error(`[crypto-source] CoinGecko detail(${id}) failed:`, err);
  }
  return yahoo.fetchYahooCoinDetail(id);
}

export async function getCoinChart(id: string, days: string): Promise<CoinChart> {
  const code = normalizeCryptoTicker(id);
  try {
    const chart = await swyftx.fetchCoinChart(code, days);
    if (chart.prices.length > 0) return chart;
    throw new Error("Swyftx returned an empty chart series");
  } catch (err) {
    console.error(`[crypto-source] Swyftx chart(${id}) failed:`, err);
  }
  try {
    const chart = await coingecko.fetchCoinChart(toCgId(id), days);
    if (chart.prices.length > 0) return chart;
    throw new Error("CoinGecko returned an empty chart series");
  } catch (err) {
    console.error(`[crypto-source] CoinGecko chart(${id}) failed:`, err);
  }
  return yahoo.fetchYahooCoinChart(id, days);
}
