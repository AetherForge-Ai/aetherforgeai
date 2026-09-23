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
import type { CoinMarket, CoinDetail, CoinChart } from "@/lib/crypto-market";
import { canonicalCryptoId, normalizeCryptoTicker } from "@/lib/crypto-ids";

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

export async function getTop500(): Promise<CoinMarket[]> {
  const parts: CoinMarket[][] = [];

  try {
    const coins = await swyftx.fetchTop500();
    if (coins && coins.length > 0) {
      console.log(`[crypto-source] top500 via Swyftx (${coins.length})`);
      if (coins.length >= MIN_CRYPTO_UNIVERSE) return coins;
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
        if (mergeByRank(parts).length >= MIN_CRYPTO_UNIVERSE && parts.length === 1) return coins;
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
  return merged;
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
