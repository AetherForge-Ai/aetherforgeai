/**
 * Shared types for the AetherForge Stox self-hosted package.
 */

import type { SecurityIntel } from "./market-intel.js";
import type { YahooQuote } from "./yahoo.js";

export interface PortfolioHolding {
  ticker: string;
  shares: number;
  avgPrice: number;
}

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

export interface PortfolioSummary {
  totalValue: number;
  totalCost: number;
  totalPnl: number;
  totalPnlPct: number;
  holdingsCount: number;
}

export interface StoxReport {
  generatedAt: string;
  title: string;
  summary: PortfolioSummary;
  holdings: FullHoldingAnalysis[];
  disclaimer: string;
}
