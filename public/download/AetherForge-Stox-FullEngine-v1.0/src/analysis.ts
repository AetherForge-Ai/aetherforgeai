/**
 * Full analysis bridge — uses the same market-intel engine as the AetherForge website.
 */

import { analyzeSecurity, type SecurityIntel, type MarketCode } from "./market-intel.js";
import type { YahooQuote } from "./yahoo.js";
import type { PortfolioHolding } from "./types.js";

export interface FullHoldingAnalysis {
  holding: PortfolioHolding;
  intel: SecurityIntel;
  marketValue: number;
  costBasis: number;
  pnl: number;
  pnlPct: number;
  usedRealHistory: boolean;
  liveQuote: YahooQuote | null;
}

function round(v: number, dp = 2): number {
  const f = Math.pow(10, dp);
  return Math.round(v * f) / f;
}

function detectMarket(ticker: string): MarketCode {
  const t = ticker.toUpperCase();
  if (t.endsWith(".NZ")) return "NZX";
  if (t.endsWith(".AX")) return "ASX";
  return "US";
}

/**
 * Run the full website engine on one holding.
 */
export function analyseHoldingFull(
  holding: PortfolioHolding,
  quote: YahooQuote | null,
  history: number[] | null
): FullHoldingAnalysis {
  const livePrice = quote?.price ?? holding.avgPrice;
  const name = quote?.name;
  const market = detectMarket(holding.ticker);
  const usedRealHistory = !!(history && history.length >= 40);

  const intel = analyzeSecurity(
    holding.ticker,
    livePrice,
    name,
    market,
    usedRealHistory ? history! : undefined
  );

  const marketValue = round(holding.shares * intel.price, 2);
  const costBasis = round(holding.shares * holding.avgPrice, 2);
  const pnl = round(marketValue - costBasis, 2);
  const pnlPct = costBasis > 0 ? round((pnl / costBasis) * 100, 2) : 0;

  return {
    holding,
    intel,
    marketValue,
    costBasis,
    pnl,
    pnlPct,
    usedRealHistory,
    liveQuote: quote,
  };
}
