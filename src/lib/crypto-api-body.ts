/**
 * JSON bodies for the public crypto routes.
 * Status stays 200 so Cloudflare does not replace the body with "error code: 502".
 */

import { dexListNotice } from "@/lib/crypto-dex";
import { LIVE_CRYPTO_UNAVAILABLE } from "@/lib/crypto-market";

export const LIVE_DEX_UNAVAILABLE = "Live decentralized-token prices are unavailable.";

export function marketsBody(coins: unknown[] | null | undefined, notice: string | null) {
  if (!coins || coins.length === 0) {
    return { ok: false as const, error: LIVE_CRYPTO_UNAVAILABLE };
  }
  return { ok: true as const, data: coins, total: coins.length, notice };
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
