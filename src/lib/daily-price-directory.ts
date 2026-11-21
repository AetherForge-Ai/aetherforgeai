/**
 * Index symbols and constituent names already in the repo.
 * Names and symbols only. A directory seed is not a close.
 */

import { entriesForExchange, EXCHANGE_META, EXCHANGES, type Exchange } from "@/lib/market-intel";

export interface DirectoryName {
  market: Exchange;
  symbol: string;
  name: string;
  role: "index" | "constituent";
}

/** Same headline symbols as src/app/api/market-snapshot/route.ts. */
export const DAILY_INDEX: Record<Exchange, { symbol: string; name: string }> = {
  NZX: { symbol: "^NZ50", name: "S&P/NZX 50" },
  ASX: { symbol: "^AXJO", name: "S&P/ASX 200" },
  DOW: { symbol: "^DJI", name: "Dow Jones Industrial Average" },
  NASDAQ: { symbol: "^IXIC", name: "Nasdaq Composite" },
};

export function dailyPriceDirectory(): DirectoryName[] {
  const rows: DirectoryName[] = [];
  for (const market of EXCHANGES) {
    const index = DAILY_INDEX[market];
    rows.push({ market, symbol: index.symbol, name: index.name, role: "index" });
    for (const entry of entriesForExchange(market)) {
      rows.push({
        market,
        symbol: entry.ticker.toUpperCase(),
        name: entry.name,
        role: "constituent",
      });
    }
  }
  return rows;
}

export function marketLabel(market: Exchange): string {
  return EXCHANGE_META[market].label;
}
