/**
 * Canonical crypto ID map — USD per 1 whole token.
 * The ids themselves live in crypto-vendors.ts.
 */

import { CRYPTO_VENDORS, coingeckoIdFor, normalizeCryptoTicker } from "@/lib/crypto-vendors";

export const CANONICAL_CRYPTO_IDS: Record<string, string> = Object.fromEntries(
  Object.values(CRYPTO_VENDORS).map((row) => [row.ticker, row.coingecko])
);

export const CRYPTO_DISPLAY_NAMES: Record<string, string> = Object.fromEntries(
  Object.values(CRYPTO_VENDORS).map((row) => [row.ticker, row.name])
);

/** Normalize a crypto ticker and return its canonical CoinGecko id. */
export function canonicalCryptoId(ticker: string): string {
  return coingeckoIdFor(ticker) ?? normalizeCryptoTicker(ticker).toLowerCase();
}

export { normalizeCryptoTicker };
