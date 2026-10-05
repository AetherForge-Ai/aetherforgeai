/**
 * JSON bodies for the public crypto routes.
 * Status stays 200 so Cloudflare does not replace the body with "error code: 502".
 */

import { LIVE_CRYPTO_UNAVAILABLE } from "@/lib/crypto-market";

export const LIVE_DEX_UNAVAILABLE = "Live decentralized-token prices are unavailable.";

export function marketsBody(coins: unknown[] | null | undefined, notice: string | null) {
  if (!coins || coins.length === 0) {
    return { ok: false as const, error: LIVE_CRYPTO_UNAVAILABLE };
  }
  return { ok: true as const, data: coins, total: coins.length, notice };
}

export function dexBody(rows: unknown[] | null | undefined, notice: string | null) {
  if (!rows || rows.length === 0) {
    return { ok: false as const, error: LIVE_DEX_UNAVAILABLE };
  }
  return { ok: true as const, data: rows, total: rows.length, notice };
}
