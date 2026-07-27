/**
 * Shared types for the AetherForge Koins self-hosted package.
 */

import type { SecurityIntel } from "./market-intel.js";
import type { CryptoQuote } from "./market-data.js";

export interface PortfolioHolding {
  symbol: string;
  quantity: number;
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
  liveQuote: CryptoQuote | null;
}

export interface PortfolioSummary {
  totalValue: number;
  totalCost: number;
  totalPnl: number;
  totalPnlPct: number;
  holdingsCount: number;
}

export interface KoinsReport {
  generatedAt: string;
  title: string;
  summary: PortfolioSummary;
  holdings: FullHoldingAnalysis[];
  disclaimer: string;
}
