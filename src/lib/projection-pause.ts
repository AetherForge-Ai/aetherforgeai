/**
 * Crypto projections stay paused until the owner finishes the 10-coin hand-check
 * in crypto-vendors.ts (BTC, ETH, SOL, BNB, XRP, ARB, TON, JUP, UNI, APT).
 * Do not set CRYPTO_PROJECTIONS_PAUSED to false before that check.
 */

export const CRYPTO_PROJECTIONS_PAUSED = true;

export const CRYPTO_PROJECTIONS_PAUSE_MESSAGE =
  "Crypto projections on this page are paused while a data issue is fixed. Koins still writes a 7-day illustrative outlook on a book that has positions. Live coin prices stay on Markets.";

export function isCryptoProjectionRow(row: { market?: string | null; assetClass?: string | null }): boolean {
  return row.market === "CRYPTO" || row.assetClass === "crypto";
}

export function withoutCryptoProjections<T extends { market?: string | null; assetClass?: string | null }>(
  rows: T[],
): T[] {
  return rows.filter((row) => !isCryptoProjectionRow(row));
}

/** Same order on every tab: projected percent times model confidence. */
export function confidenceWeightedMove(row: { projected7dPct: number; confidence?: number | null }): number {
  const confidence =
    typeof row.confidence === "number" && Number.isFinite(row.confidence) ? row.confidence : 100;
  return row.projected7dPct * (confidence / 100);
}

export function rankByConfidenceWeightedMove<T extends { projected7dPct: number; confidence?: number | null }>(
  rows: T[],
): T[] {
  return [...rows].sort((a, b) => confidenceWeightedMove(b) - confidenceWeightedMove(a));
}

/** Rank equities only. Crypto rows are dropped before the Top 50 is cut. */
export function assembleEquityProjections<
  T extends { market?: string | null; assetClass?: string | null; projected7dPct: number; confidence?: number | null },
>(stockUniverse: T[]) {
  const stocks = withoutCryptoProjections(stockUniverse);
  const combined = rankByConfidenceWeightedMove(stocks).slice(0, 50);
  return {
    cryptoPaused: CRYPTO_PROJECTIONS_PAUSED,
    cryptoPauseMessage: CRYPTO_PROJECTIONS_PAUSE_MESSAGE,
    combined,
    stockUniverse: stocks,
    cryptoUniverse: [] as T[],
    scanned: { stocks: stocks.length, crypto: 0 },
  };
}
