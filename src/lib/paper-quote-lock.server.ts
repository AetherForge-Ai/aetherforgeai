import "server-only";

import { universeFor } from "@/lib/market-intel";
import { fetchYahooQuote } from "@/lib/yahoo-finance";
import { applyLockedActionPrices, seedTickersInReport } from "@/lib/paper-quote-lock";

const EQUITIES = new Set(universeFor("stock").map((entry) => entry.ticker.toUpperCase()));

function chartTicker(ticker: string): boolean {
  const upper = ticker.toUpperCase();
  return EQUITIES.has(upper) || /\.(AX|NZ)$/.test(upper);
}

/**
 * Re-price stored or freshly built equity rows that still show a directory seed.
 * Uses the same Yahoo chart quote the paper order form locks. A seed with no
 * chart quote is dropped. Does not send email.
 */
export async function relockSeededReportPrices<T>(report: T): Promise<T> {
  const tickers = new Set(seedTickersInReport(report).filter(chartTicker));
  const recommendations = (report as { directRecommendations?: Array<{ ticker?: string }> } | null)?.directRecommendations;
  for (const row of recommendations ?? []) {
    if (row?.ticker && chartTicker(row.ticker)) tickers.add(row.ticker.toUpperCase());
  }
  const quotes: Record<string, number> = {};
  if (tickers.size) {
    await Promise.all(
      [...tickers].map(async (ticker) => {
        try {
          const quote = await fetchYahooQuote(ticker);
          if (quote && quote.price > 0) quotes[ticker] = quote.price;
        } catch (err) {
          console.error(`[paper-quote] Chart quote failed for ${ticker}:`, err);
        }
      })
    );
  }
  return applyLockedActionPrices(report, quotes);
}
