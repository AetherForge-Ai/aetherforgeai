/**
 * One public crypto-coverage line, taken from the rows actually shown.
 * The Crypto tab is the CoinGecko top 400. Do not round the count.
 * A short list names the count that arrived, never a target the feed did not return.
 */
// pull-check:qa-2026-10-10-urgent-u3-u5
// pull-check:track-a1-2026-10-10

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

/** Why a CoinGecko list stopped short of 400. Null only when 400 coins are in hand. */
export function listedMarketNotice(count: number, reason: "page2" | "backup" | "short" | null): string | null {
  const shown = Math.max(0, Math.round(Number(count) || 0));
  if (shown >= 400 || reason == null) return null;
  if (reason === "backup") {
    return `CoinGecko did not return a market list (rate limit or the feed did not answer). This list is the backup feed: ${shown} coins, not 400.`;
  }
  if (reason === "page2") {
    return `CoinGecko did not return the second page (rate limit or plan cap). Showing ${shown}, not 400.`;
  }
  return `CoinGecko returned ${shown} coins with a live price, not 400.`;
}

/** Button label. "DEX top 400" only when 400 tokens were delivered. */
export function dexTabLabel(count: number): string {
  const shown = Math.max(0, Math.round(Number(count) || 0));
  if (shown >= 400) return "DEX top 400";
  if (shown <= 0) return "DEX";
  return `DEX top ${shown}`;
}

/** Subtitle under the DEX search. The number is the row count, never a fallback of 400. */
export function dexCoverageLine(count: number): string {
  const shown = Math.max(0, Math.round(Number(count) || 0));
  if (shown >= 400) return "Top 400 DEX tokens by 24-hour volume · GeckoTerminal";
  if (shown <= 0) return "DEX list · GeckoTerminal returned 0 tokens, not 400";
  return `Top ${shown} DEX tokens by 24-hour volume · GeckoTerminal`;
}
