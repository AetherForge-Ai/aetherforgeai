import { fiftyTwoWeekLine, headlinesForSymbol, NEWS_MISSING, sectorLine, sparklinePoints } from "@/lib/stock-public-facts";
import { loadMarketNews } from "@/lib/market-news";
import { fetchYahooHistories, fetchYahooQuote, yahooEquitySymbol } from "@/lib/yahoo-finance";

const WAIT_MS = 1200;

async function within<T>(work: Promise<T>, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), WAIT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Facts in the first HTML of a stock page: sector, 52-week range, a six-month
 * sparkline, and headlines that name the symbol. A missing feed value is an
 * em dash with the reason. Nothing is invented.
 */
export async function StockPublicFacts({
  ticker,
  symbol,
  sector,
}: {
  ticker: string;
  symbol: string;
  sector: string;
}) {
  const ySymbol = yahooEquitySymbol(ticker);
  const [quote, history, news] = await Promise.all([
    within(fetchYahooQuote(ySymbol).catch(() => null), null),
    within(fetchYahooHistories({ [ticker]: ySymbol }, "6mo", "1d").catch(() => ({})), {}),
    within(loadMarketNews("stock").catch(() => []), []),
  ]);
  const closes = history[ticker] ?? [];
  const points = sparklinePoints(closes);
  const range = fiftyTwoWeekLine(quote?.fiftyTwoWeekLow, quote?.fiftyTwoWeekHigh, quote?.currency);
  const headlines = headlinesForSymbol(news, symbol || ticker);

  return (
    <section className="mx-auto w-full max-w-6xl space-y-3 px-4 sm:px-6 lg:px-8" aria-label="Listing facts">
      <p className="text-sm text-muted-foreground">
        <span className="font-semibold text-foreground">Sector: </span>
        {sectorLine(sector)}
      </p>
      <p className="text-sm text-muted-foreground">
        <span className="font-semibold text-foreground">52-week range: </span>
        {range}
      </p>
      <div>
        <p className="text-sm font-semibold text-foreground">About six months of daily closes</p>
        {points ? (
          <svg viewBox="0 0 280 72" className="mt-2 h-20 w-full max-w-md text-primary" role="img" aria-label="Six-month close series">
            <polyline fill="none" stroke="currentColor" strokeWidth="2" points={points} />
          </svg>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">— The feed did not send a six-month series.</p>
        )}
      </div>
      <div>
        <p className="text-sm font-semibold text-foreground">News</p>
        {headlines.length ? (
          <ul className="mt-1 list-disc pl-5 text-sm text-muted-foreground">
            {headlines.map((headline) => (
              <li key={headline}>{headline}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">{NEWS_MISSING}</p>
        )}
      </div>
    </section>
  );
}
