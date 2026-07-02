/**
 * Lightweight market-data helper.
 *
 * This project has no external market-data API key, so we ship a curated
 * directory of well-known tickers (name, sector, a realistic reference price)
 * and simulate live price movement with a small random walk. When a user adds
 * an unknown ticker we still behave gracefully.
 *
 * Pure module — safe to import on both client and server.
 */

export interface TickerInfo {
  ticker: string;
  name: string;
  sector: string;
  price: number;
}

export const TICKER_DIRECTORY: TickerInfo[] = [
  { ticker: "AAPL", name: "Apple Inc.", sector: "Technology", price: 229.87 },
  { ticker: "MSFT", name: "Microsoft Corporation", sector: "Technology", price: 441.58 },
  { ticker: "NVDA", name: "NVIDIA Corporation", sector: "Semiconductors", price: 131.26 },
  { ticker: "GOOGL", name: "Alphabet Inc.", sector: "Communication Services", price: 178.35 },
  { ticker: "AMZN", name: "Amazon.com, Inc.", sector: "Consumer Discretionary", price: 201.44 },
  { ticker: "META", name: "Meta Platforms, Inc.", sector: "Communication Services", price: 594.12 },
  { ticker: "TSLA", name: "Tesla, Inc.", sector: "Automotive", price: 342.68 },
  { ticker: "AVGO", name: "Broadcom Inc.", sector: "Semiconductors", price: 176.9 },
  { ticker: "BRK.B", name: "Berkshire Hathaway Inc.", sector: "Financials", price: 468.22 },
  { ticker: "JPM", name: "JPMorgan Chase & Co.", sector: "Financials", price: 243.75 },
  { ticker: "V", name: "Visa Inc.", sector: "Financials", price: 312.09 },
  { ticker: "MA", name: "Mastercard Incorporated", sector: "Financials", price: 528.4 },
  { ticker: "UNH", name: "UnitedHealth Group Inc.", sector: "Healthcare", price: 508.11 },
  { ticker: "LLY", name: "Eli Lilly and Company", sector: "Healthcare", price: 782.5 },
  { ticker: "JNJ", name: "Johnson & Johnson", sector: "Healthcare", price: 152.34 },
  { ticker: "XOM", name: "Exxon Mobil Corporation", sector: "Energy", price: 118.62 },
  { ticker: "CVX", name: "Chevron Corporation", sector: "Energy", price: 161.03 },
  { ticker: "WMT", name: "Walmart Inc.", sector: "Consumer Staples", price: 92.87 },
  { ticker: "COST", name: "Costco Wholesale Corporation", sector: "Consumer Staples", price: 964.21 },
  { ticker: "HD", name: "The Home Depot, Inc.", sector: "Consumer Discretionary", price: 411.7 },
  { ticker: "PG", name: "The Procter & Gamble Company", sector: "Consumer Staples", price: 168.29 },
  { ticker: "KO", name: "The Coca-Cola Company", sector: "Consumer Staples", price: 62.85 },
  { ticker: "NFLX", name: "Netflix, Inc.", sector: "Communication Services", price: 897.34 },
  { ticker: "AMD", name: "Advanced Micro Devices, Inc.", sector: "Semiconductors", price: 122.18 },
  { ticker: "CRM", name: "Salesforce, Inc.", sector: "Technology", price: 336.55 },
  { ticker: "ADBE", name: "Adobe Inc.", sector: "Technology", price: 476.9 },
  { ticker: "DIS", name: "The Walt Disney Company", sector: "Communication Services", price: 111.42 },
  { ticker: "INTC", name: "Intel Corporation", sector: "Semiconductors", price: 20.15 },
  { ticker: "BA", name: "The Boeing Company", sector: "Industrials", price: 177.6 },
  { ticker: "PLTR", name: "Palantir Technologies Inc.", sector: "Technology", price: 66.5 },
];

const DIRECTORY_MAP: Record<string, TickerInfo> = TICKER_DIRECTORY.reduce(
  (acc, t) => {
    acc[t.ticker] = t;
    return acc;
  },
  {} as Record<string, TickerInfo>
);

export function normalizeTicker(raw: string): string {
  return (raw || "").trim().toUpperCase();
}

export function lookupTicker(raw: string): TickerInfo | undefined {
  return DIRECTORY_MAP[normalizeTicker(raw)];
}

/**
 * Resolve a reference "current" price for a ticker.
 * Known tickers use their directory price; unknown tickers hover near the
 * purchase price so gains/losses stay believable.
 */
export function referencePrice(ticker: string, fallback: number): number {
  const info = lookupTicker(ticker);
  if (info) return info.price;
  return Math.max(0.01, Number(fallback) || 0);
}

/**
 * Apply a bounded random-walk step to a price to simulate a market tick.
 * Deterministic-ish daily drift so a portfolio isn't uniformly red or green.
 */
export function simulateTick(price: number): number {
  const drift = (Math.random() - 0.48) * 0.035; // slight upward bias, ±~3.5%
  const next = price * (1 + drift);
  return Math.round(Math.max(0.01, next) * 100) / 100;
}
