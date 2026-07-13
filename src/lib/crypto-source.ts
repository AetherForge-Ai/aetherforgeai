/**
 * Crypto data source selector (server-only).
 *
 * Swyftx is the primary provider (the user's exchange). CoinGecko remains as an
 * automatic fallback so the Crypto Market surface never goes dark if Swyftx is
 * briefly unreachable. The two use different id namespaces — Swyftx uses short
 * ticker codes ("btc"), CoinGecko uses slugs ("bitcoin") — but they don't
 * collide, so the try-Swyftx-then-CoinGecko cascade resolves detail/chart
 * requests correctly regardless of which provider produced the list.
 */

import "server-only";
import * as swyftx from "@/lib/crypto-swyftx";
import * as coingecko from "@/lib/crypto-coingecko";
import type { CoinMarket, CoinDetail, CoinChart } from "@/lib/crypto-market";

export async function getTop500(): Promise<CoinMarket[]> {
  try {
    const coins = await swyftx.fetchTop500();
    if (coins && coins.length > 0) return coins;
    throw new Error("Swyftx returned an empty market list");
  } catch (err) {
    console.error("[crypto-source] Swyftx top500 failed — falling back to CoinGecko:", err);
    return coingecko.fetchTop500();
  }
}

export async function getCoinDetail(id: string): Promise<CoinDetail> {
  try {
    return await swyftx.fetchCoinDetail(id);
  } catch (err) {
    console.error(`[crypto-source] Swyftx detail(${id}) failed — trying CoinGecko:`, err);
    return coingecko.fetchCoinDetail(id);
  }
}

export async function getCoinChart(id: string, days: string): Promise<CoinChart> {
  try {
    const chart = await swyftx.fetchCoinChart(id, days);
    if (chart.prices.length > 0) return chart;
    throw new Error("Swyftx returned an empty chart series");
  } catch (err) {
    console.error(`[crypto-source] Swyftx chart(${id}) failed — trying CoinGecko:`, err);
    return coingecko.fetchCoinChart(id, days);
  }
}
