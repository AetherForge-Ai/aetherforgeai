/**
 * JSON bodies for the public crypto routes.
 * Status stays 200 so Cloudflare does not replace the body with "error code: 502".
 */

import { dexListNotice } from "@/lib/crypto-dex";
import { LIVE_CRYPTO_UNAVAILABLE, MARKET_SIZE_FIELDS, positiveMarketStat } from "@/lib/crypto-market";

export const LIVE_DEX_UNAVAILABLE = "Live decentralized-token prices are unavailable.";

/**
 * A zero market cap, FDV, volume, high, low, supply or ATH is unknown.
 * The cell is an em dash, not 0. A real 0% change is left as 0.
 */
export function presentMarketCoin<T extends object>(coin: T): T {
  const next = { ...coin } as T & Record<string, unknown>;
  for (const key of MARKET_SIZE_FIELDS) {
    if (key in next) next[key] = positiveMarketStat(next[key]);
  }
  return next as T;
}

export function marketsBody(coins: unknown[] | null | undefined, notice: string | null) {
  if (!coins || coins.length === 0) {
    return { ok: false as const, error: LIVE_CRYPTO_UNAVAILABLE };
  }
  const data = coins.map((coin) =>
    coin && typeof coin === "object" ? presentMarketCoin(coin as { marketCap?: unknown; volume24h?: unknown }) : coin
  );
  return { ok: true as const, data, total: data.length, notice };
}

export function dexBody(
  rows: unknown[] | null | undefined,
  opts?: { collecting?: boolean; notice?: string | null }
) {
  const list = Array.isArray(rows) ? rows : [];
  if (list.length === 0 && !opts?.collecting) {
    return { ok: false as const, error: LIVE_DEX_UNAVAILABLE };
  }
  const notice =
    opts && "notice" in opts
      ? opts.notice ?? null
      : dexListNotice(list.length, false);
  return {
    ok: true as const,
    data: list,
    total: list.length,
    notice,
  };
}
