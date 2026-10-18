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

/**
 * Slugs for tickers that are not in the projection vendor list.
 * USDT must stay tether — canonicalCryptoId("USDT") used to be "" after the suffix strip.
 */
const SLUG_BY_TICKER: Record<string, string> = {
  USDT: "tether",
  USDC: "usd-coin",
  DAI: "dai",
  RAIN: "rain",
};

/** CoinGecko slug for a ticker. Unknown tickers become the lower-case code, never an empty string. */
export function canonicalCryptoId(ticker: string): string {
  const code = normalizeCryptoTicker(ticker);
  if (!code) return "";
  return coingeckoIdFor(code) ?? SLUG_BY_TICKER[code] ?? code.toLowerCase();
}

/** Ticker for a CoinGecko slug, when we have one. Used to match a snapshot row to a coin page. */
export function tickerForCoingeckoId(id: string | null | undefined): string | null {
  const slug = (id || "").trim().toLowerCase();
  if (!slug) return null;
  const fromVendor = Object.values(CRYPTO_VENDORS).find((row) => row.coingecko === slug);
  if (fromVendor) return fromVendor.ticker;
  const hit = Object.entries(SLUG_BY_TICKER).find(([, mapped]) => mapped === slug);
  return hit ? hit[0] : null;
}

export { normalizeCryptoTicker };
