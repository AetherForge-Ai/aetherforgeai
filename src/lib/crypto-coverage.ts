/**
 * One public crypto-coverage line, taken from the rows actually shown.
 * 89 rows read as "~90". The fetch size is not a coverage claim.
 */

export function cryptoCoverageCount(rowCount: number): number {
  const count = Math.max(0, Math.round(Number(rowCount) || 0));
  if (count <= 0) return 0;
  return Math.max(10, Math.round(count / 10) * 10);
}

/** "The ~90 largest coins by market cap", or a number-free line when the list is empty. */
export function cryptoCoveragePhrase(rowCount: number): string {
  const rounded = cryptoCoverageCount(rowCount);
  if (!rounded) return "The largest coins by market cap";
  return `The ~${rounded} largest coins by market cap`;
}

export const SUPPLY_NOT_AVAILABLE = "Not available";
