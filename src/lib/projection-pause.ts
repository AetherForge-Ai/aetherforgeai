/**
 * Crypto projections stay off until the coin history and live price agree.
 * This is the projections layer only. It does not call or change the crypto price service.
 */

export const CRYPTO_PROJECTIONS_PAUSED = true;

export const CRYPTO_PROJECTIONS_PAUSE_MESSAGE =
  "Crypto projections are paused while we fix a data issue. Live coin prices are still on Markets.";

export function isCryptoProjectionRow(row: { market?: string | null; assetClass?: string | null }): boolean {
  return row.market === "CRYPTO" || row.assetClass === "crypto";
}

export function withoutCryptoProjections<T extends { market?: string | null; assetClass?: string | null }>(
  rows: T[],
): T[] {
  return rows.filter((row) => !isCryptoProjectionRow(row));
}

/** Rank equities only. Crypto rows are dropped before the Top 50 is cut. */
export function assembleEquityProjections<T extends { market?: string | null; assetClass?: string | null; projected7dPct: number }>(
  stockUniverse: T[],
) {
  const stocks = withoutCryptoProjections(stockUniverse);
  const combined = [...stocks].sort((a, b) => b.projected7dPct - a.projected7dPct).slice(0, 50);
  return {
    cryptoPaused: CRYPTO_PROJECTIONS_PAUSED,
    cryptoPauseMessage: CRYPTO_PROJECTIONS_PAUSE_MESSAGE,
    combined,
    stockUniverse: stocks,
    cryptoUniverse: [] as T[],
    scanned: { stocks: stocks.length, crypto: 0 },
  };
}
