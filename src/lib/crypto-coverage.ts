/**
 * One public crypto-coverage line, taken from the rows actually shown.
 * 400 is a target. A shorter list says how many arrived.
 * Do not round the count and do not invent rows to reach 400.
 */
// pull-check:qa-2026-10-10-urgent-u3-u5
// pull-check:track-a1-2026-10-10
// pull-check:crypto-dex-400-2026-10-11

export const MARKET_LIST_TARGET = 400;

export function cryptoCoverageCount(rowCount: number): number {
  const count = Math.max(0, Math.round(Number(rowCount) || 0));
  if (count <= 0) return 0;
  return Math.min(MARKET_LIST_TARGET, count);
}

/**
 * "The top 400 coins by market cap" only when 400 priced coins are in hand.
 * A shorter list is "Showing N of up to 400". An empty list stays number-free.
 */
export function cryptoCoveragePhrase(rowCount: number): string {
  const count = cryptoCoverageCount(rowCount);
  if (!count) return "The largest coins by market cap";
  if (count >= MARKET_LIST_TARGET) return "The top 400 coins by market cap";
  return `Showing ${count} of up to ${MARKET_LIST_TARGET}`;
}

export const SUPPLY_NOT_AVAILABLE = "Not available";

/** Why a list stopped short of 400. Null only when 400 coins are in hand. */
export function listedMarketNotice(count: number, reason: "page2" | "backup" | "short" | null): string | null {
  const shown = Math.max(0, Math.round(Number(count) || 0));
  if (shown >= MARKET_LIST_TARGET || reason == null) return null;
  const lead = `Showing ${shown} of up to ${MARKET_LIST_TARGET}.`;
  if (reason === "backup") {
    return `${lead} CoinGecko did not return a market list (rate limit or the feed did not answer). This list is the backup feed.`;
  }
  if (reason === "page2") {
    return `${lead} CoinGecko did not return the second page (rate limit or plan cap).`;
  }
  return `${lead} The feeds returned ${shown} coins with a live price.`;
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
  if (shown >= MARKET_LIST_TARGET) return "Top 400 DEX tokens by 24-hour volume · GeckoTerminal";
  return `Showing ${shown} of up to ${MARKET_LIST_TARGET}`;
}
