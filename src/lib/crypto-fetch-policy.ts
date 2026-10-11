/**
 * CoinGecko page-fetch policy. A failed page is not an empty market list.
 *
 * pull-check:retest4-2026-10-11
 */

/** Pause before attempt 1 and attempt 2. Attempt 0 starts at once. */
export function coinGeckoRetryDelayMs(attempt: number): number {
  const n = Math.max(0, Math.round(attempt) || 0);
  if (n <= 0) return 0;
  return 400 * n;
}

/** Retry these HTTP statuses. A 200 with a market array is not a retry. 1015 is a Cloudflare block. */
export function coinGeckoStatusRetries(status: number): boolean {
  return status === 403 || status === 429 || status === 1015 || status === 500 || status === 502 || status === 503 || status === 504;
}

/**
 * A markets page is an array of rows. An error object, HTML, or anything else
 * is a failed page, not a list of zero coins.
 */
export function readMarketPage(body: unknown): unknown[] | null {
  return Array.isArray(body) ? body : null;
}
