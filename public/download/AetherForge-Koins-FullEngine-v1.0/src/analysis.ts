/**
 * Full analysis bridge for Koins — same market-intel engine as the website.
 */

import { analyzeSecurity, type SecurityIntel } from "./market-intel.js";
import type { CryptoQuote } from "./market-data.js";
import type { PortfolioHolding, FullHoldingAnalysis } from "./types.js";

function round(v: number, dp = 2): number {
  const f = Math.pow(10, dp);
  return Math.round(v * f) / f;
}

/**
 * Run the full website engine on one crypto holding.
 */
export function analyseHoldingFull(
  holding: PortfolioHolding,
  quote: CryptoQuote | null,
  history: number[] | null
): FullHoldingAnalysis {
  const livePrice = quote?.price ?? holding.avgPrice;
  const name = quote?.name;
  const usedRealHistory = !!(history && history.length >= 40);

  const intel = analyzeSecurity(
    holding.symbol,
    livePrice,
    name,
    "CRYPTO",
    usedRealHistory ? history! : undefined
  );

  const marketValue = round(holding.quantity * intel.price, 2);
  const costBasis = round(holding.quantity * holding.avgPrice, 2);
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
