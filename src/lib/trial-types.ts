/**
 * Shared, PURE types for the one-time Free-Trial "Zenith Mode" report.
 *
 * No server-only imports — this module is safe to import from BOTH the server
 * report engine (`trial-report.ts`) and the client result view
 * (`TrialReportView.tsx`), so the exact same shape flows end-to-end.
 */

export type BotKind = "stock" | "crypto";

/** A single point on a 12-month continuation / momentum chart. */
export interface MonthPoint {
  label: string; // e.g. "Aug 25"
  value: number;
}

/** A gainer/loser row on a movers board. */
export interface MoverEntry {
  symbol: string;
  name: string;
  price: number;
  changePct: number;
  image?: string | null;
}

export interface NewsHeadline {
  title: string;
  source: string;
  url: string;
  publishedAt: string; // ISO
  snippet: string;
  impact: "Bullish" | "Bearish" | "Neutral";
}

export type TrialSignal = "Strong Buy" | "Accumulate" | "Hold" | "Watch" | "Reduce";

/** A single fact-based forward prediction for a horizon. */
export interface ForwardPrediction {
  horizon: string; // "7-day" | "30-day"
  direction: "up" | "down" | "flat";
  expectedMovePct: number;
  confidence: number; // 0-100
  rationale: string; // grounded in the real numbers
}

export interface TrialHolding {
  shares: number;
  avgPrice: number;
  value: number;
  pnl: number;
  pnlPct: number;
}

export interface TrialTickerAnalysis {
  symbol: string;
  name: string;
  assetClass: BotKind;
  image?: string | null;
  price: number;
  change24h: number;
  change7d: number;
  change30d: number;
  momentum12mo: MonthPoint[];
  momentum12moPct: number;
  momentumIsLive: boolean;
  signal: TrialSignal;
  sentiment: number; // 0-100
  rsi?: number | null;
  macdSignal?: "Bullish" | "Bearish" | "Neutral" | null;
  predictions: ForwardPrediction[];
  holding?: TrialHolding | null;
  note: string;
}

export interface CryptoMoverBoards {
  gainers24h: MoverEntry[];
  losers24h: MoverEntry[];
  gainers7d: MoverEntry[];
  gainers30d: MoverEntry[];
}

export interface StockMoverBoards {
  gainers: MoverEntry[];
  losers: MoverEntry[];
  universeSize: number;
  live: boolean;
}

export interface MarketPrediction {
  headline: string;
  detail: string;
  confidence: number; // 0-100
}

export interface TrialReport {
  bot: BotKind;
  /** Marketing mode label, e.g. "ZENITH MODE · ULTRA ADVANCED". */
  mode: string;
  title: string;
  marketLabel: string;
  scopeLabel: string; // "Top 100 cryptocurrencies" | "Entire NZX + ASX market"
  generatedAtLabel: string;
  dataLive: boolean;
  executiveSummary: string;
  aiEnhanced: boolean;
  keyFindings: string[];
  cryptoMovers?: CryptoMoverBoards | null;
  stockMovers?: StockMoverBoards | null;
  news: NewsHeadline[];
  tickers: TrialTickerAnalysis[];
  portfolio?: { value: number; cost: number; pnl: number; pnlPct: number } | null;
  predictions: MarketPrediction[];
}
