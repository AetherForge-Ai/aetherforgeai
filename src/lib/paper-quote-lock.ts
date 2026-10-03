/**
 * Report prices that still equal a directory seed are not the quote the paper
 * form locks. A caller that has that quote passes it in; otherwise the row is
 * omitted so a reload cannot bring the seed back.
 */

import { priceMatchesUniverseSeed } from "@/lib/market-intel";

interface PricedRow {
  ticker?: string;
  price?: number;
}

function quoteFor(ticker: string, quotes: Record<string, number>): number | undefined {
  const raw = quotes[ticker] ?? quotes[ticker.toUpperCase()];
  return typeof raw === "number" && isFinite(raw) && raw > 0 ? raw : undefined;
}

function lockRow<T extends PricedRow>(row: T, quotes: Record<string, number>): T | null {
  if (!row || typeof row.ticker !== "string" || typeof row.price !== "number") return row;
  if (!priceMatchesUniverseSeed(row.ticker, row.price)) return row;
  const quote = quoteFor(row.ticker, quotes);
  // A chart print that is still the directory seed is not used.
  if (quote == null || priceMatchesUniverseSeed(row.ticker, quote)) return null;
  return { ...row, price: quote };
}

/**
 * Action rows take the paper-form quote whenever one was supplied.
 * A directory seed is removed when that quote is missing or is itself the seed.
 */
export function applyLockedActionPrices<T>(report: T, quotes: Record<string, number> = {}): T {
  if (!report || typeof report !== "object") return report;
  const src = report as T & { directRecommendations?: PricedRow[] };
  const next = { ...src };
  if (Array.isArray(src.directRecommendations)) {
    next.directRecommendations = src.directRecommendations.flatMap((row) => {
      if (!row || typeof row.ticker !== "string" || typeof row.price !== "number") return [row];
      const quote = quoteFor(row.ticker, quotes);
      if (quote != null && !priceMatchesUniverseSeed(row.ticker, quote)) return [{ ...row, price: quote }];
      if (priceMatchesUniverseSeed(row.ticker, row.price)) return [];
      return [row];
    });
  }
  return applyPaperQuotes(next, quotes);
}

function visitRows(report: unknown, visit: (row: PricedRow) => void) {
  if (!report || typeof report !== "object") return;
  const src = report as {
    directRecommendations?: PricedRow[];
    projectionLeaders?: PricedRow[];
    marketMovers?: Array<{ windows?: Array<{ movers?: PricedRow[] }> }>;
  };
  for (const row of src.directRecommendations ?? []) visit(row);
  for (const row of src.projectionLeaders ?? []) visit(row);
  for (const group of src.marketMovers ?? []) {
    for (const window of group.windows ?? []) {
      for (const row of window.movers ?? []) visit(row);
    }
  }
}

/** Tickers whose displayed price is still the directory seed. */
export function seedTickersInReport(report: unknown): string[] {
  const found = new Set<string>();
  visitRows(report, (row) => {
    if (typeof row.ticker === "string" && typeof row.price === "number" && priceMatchesUniverseSeed(row.ticker, row.price)) {
      found.add(row.ticker.toUpperCase());
    }
  });
  return [...found];
}

/**
 * Replace seed prices with the paper-form quote when one was supplied.
 * Seed rows with no quote are removed.
 */
export function applyPaperQuotes<T>(report: T, quotes: Record<string, number> = {}): T {
  if (!report || typeof report !== "object") return report;
  const src = report as T & {
    directRecommendations?: PricedRow[];
    projectionLeaders?: PricedRow[];
    marketMovers?: Array<{ windows?: Array<{ movers?: PricedRow[] }> }>;
  };
  const next = { ...src };
  if (Array.isArray(src.directRecommendations)) {
    next.directRecommendations = src.directRecommendations
      .map((row) => lockRow(row, quotes))
      .filter((row): row is PricedRow => row != null);
  }
  if (Array.isArray(src.projectionLeaders)) {
    next.projectionLeaders = src.projectionLeaders
      .map((row) => lockRow(row, quotes))
      .filter((row): row is PricedRow => row != null);
  }
  if (Array.isArray(src.marketMovers)) {
    next.marketMovers = src.marketMovers.map((group) => {
      if (!group || !Array.isArray(group.windows)) return group;
      return {
        ...group,
        windows: group.windows.map((window) => ({
          ...window,
          movers: Array.isArray(window.movers)
            ? window.movers.map((row) => lockRow(row, quotes)).filter((row): row is PricedRow => row != null)
            : window.movers,
        })),
      };
    });
  }
  return next;
}
