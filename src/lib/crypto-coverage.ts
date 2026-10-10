/**
 * One public crypto-coverage line, taken from the rows actually shown.
 * The Crypto tab is the CoinGecko top 400. Do not round the count.
 */
// pull-check:qa-2026-10-10-urgent-u3-u5

export function cryptoCoverageCount(rowCount: number): number {
  const count = Math.max(0, Math.round(Number(rowCount) || 0));
  if (count <= 0) return 0;
  return Math.min(400, count);
}

/** "The top 400 coins by market cap", or a number-free line when the list is empty. */
export function cryptoCoveragePhrase(rowCount: number): string {
  const count = cryptoCoverageCount(rowCount);
  if (!count) return "The largest coins by market cap";
  if (count >= 400) return "The top 400 coins by market cap";
  return `The top ${count} coins by market cap`;
}

export const SUPPLY_NOT_AVAILABLE = "Not available";
