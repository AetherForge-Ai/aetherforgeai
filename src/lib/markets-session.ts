/**
 * Stox session percents use the same quote change as /markets.
 * Koins is left on its own feed.
 */

import type { SecurityIntel } from "@/lib/market-intel";

export function applyMarketsSessionChange(
  rows: SecurityIntel[],
  quotes: Record<string, { changePct?: number } | undefined>
): SecurityIntel[] {
  return rows.map((row) => {
    const quote = quotes[row.ticker] ?? quotes[row.ticker.toUpperCase()];
    const change = quote?.changePct;
    if (typeof change !== "number" || !Number.isFinite(change)) return row;
    return { ...row, change1d: change };
  });
}
