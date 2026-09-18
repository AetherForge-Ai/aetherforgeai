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

export async function getTop500(): Promise<CoinMarket[]> {
  try {
    const coins = await swyftx.fetchTop500();
    if (coins && coins.length > 0) {
      console.log(`[crypto-source] top500 via Swyftx (${coins.length})`);
      return coins;
    }
    throw new Error("Swyftx returned an empty market list");
  } catch (err) {
    console.error("[crypto-source] Swyftx top500 failed — trying CoinGecko:", err);
  }
  try {
    const coins = await coingecko.fetchTop500();
    if (coins && coins.length > 0) {
      console.log(`[crypto-source] top500 via CoinGecko (${coins.length})`);
      return coins;
    }
    throw new Error("CoinGecko returned an empty market list");
  } catch (err) {
    console.error("[crypto-source] CoinGecko top500 failed — Yahoo major fallback:", err);
  }
  const y = await yahoo.fetchYahooMajorMarkets();
  if (!y.length) throw new Error("All crypto market sources failed (Swyftx, CoinGecko, Yahoo)");
  console.log(`[crypto-source] top500 via Yahoo major (${y.length})`);
  return y;
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
