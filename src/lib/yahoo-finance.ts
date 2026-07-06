/**
 * Yahoo Finance live-quote provider — SERVER-ONLY, KEYLESS.
 *
 * Yahoo's public chart endpoint (v8) returns real-time quotes for equities
 * (NZX `.NZ`, ASX `.AX`, US), crypto (`BTC-USD`) and metals futures (`GC=F`,
 * `SI=F`) with NO API key — the same figures Google surfaces for a symbol. We
 * use it as the DEFAULT live source so the home-page ticker, dashboard and
 * reports show accurate prices out of the box, without the owner needing to
 * provision a paid market-data key.
 *
 * One request per symbol, run with a small concurrency cap and a short TTL
 * cache so a full ticker refresh stays well within Yahoo's rate limits. NEVER
 * import this on the client. Every failure is logged and degrades to an empty
 * result so a Yahoo outage can never break pricing.
 */

import "server-only";

export interface YahooQuote {
  price: number;
  changePct: number; // vs previous close, %
  currency: string;
}

const BASE = "https://query1.finance.yahoo.com/v8/finance/chart";
const TTL_MS = 60_000; // 1 minute
const CONCURRENCY = 8;

const CACHE = new Map<string, { quote: YahooQuote; at: number }>();

/** Fetch a single Yahoo symbol's current quote, or null on any failure. */
async function fetchOne(yahooSymbol: string): Promise<YahooQuote | null> {
  const cached = CACHE.get(yahooSymbol);
  if (cached && Date.now() - cached.at <= TTL_MS) return cached.quote;

  try {
    const url = `${BASE}/${encodeURIComponent(yahooSymbol)}?interval=1d&range=1d`;
    const res = await fetch(url, {
      headers: {
        // Yahoo blocks requests without a browser-like UA.
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36",
        Accept: "application/json",
      },
    });
    if (!res.ok) {
      console.error(`[yahoo] HTTP ${res.status} for ${yahooSymbol}`);
      return null;
    }
    const json = (await res.json()) as {
      chart?: { result?: Array<{ meta?: Record<string, any> }> };
    };
    const meta = json?.chart?.result?.[0]?.meta;
    if (!meta) return null;

    const price = Number(meta.regularMarketPrice);
    const prevClose = Number(meta.chartPreviousClose ?? meta.previousClose ?? price);
    if (!isFinite(price) || price <= 0) return null;

    const changePct = prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0;
    const quote: YahooQuote = {
      price,
      changePct: isFinite(changePct) ? changePct : 0,
      currency: typeof meta.currency === "string" ? meta.currency : "USD",
    };
    CACHE.set(yahooSymbol, { quote, at: Date.now() });
    return quote;
  } catch (err) {
    console.error(`[yahoo] Fetch failed for ${yahooSymbol}:`, err);
    return null;
  }
}

/** Run tasks with a bounded concurrency so we never hammer Yahoo. */
async function mapLimited<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

/**
 * Fetch quotes for a set of internal tickers, given a mapping to Yahoo symbols.
 * @param map internalTicker → yahooSymbol (e.g. { BTC: "BTC-USD", "BHP.AX": "BHP.AX" })
 * @returns internalTicker → YahooQuote (only successful lookups are included)
 */
export async function fetchYahooQuotes(map: Record<string, string>): Promise<Record<string, YahooQuote>> {
  const entries = Object.entries(map);
  if (!entries.length) return {};

  const quotes = await mapLimited(entries, CONCURRENCY, async ([internal, ySym]) => {
    const q = await fetchOne(ySym);
    return [internal, q] as const;
  });

  const out: Record<string, YahooQuote> = {};
  for (const [internal, q] of quotes) {
    if (q) out[internal] = q;
  }
  console.log(`[yahoo] Resolved ${Object.keys(out).length}/${entries.length} quotes`);
  return out;
}

/** Map an internal equity ticker to its Yahoo symbol (identical: AIR.NZ, BHP.AX, AAPL). */
export function yahooEquitySymbol(ticker: string): string {
  return ticker.toUpperCase();
}

/** Map an internal crypto ticker to its Yahoo symbol (BTC → BTC-USD). */
export function yahooCryptoSymbol(ticker: string): string {
  const t = ticker.toUpperCase().replace(/-?USDT?$/, "");
  return `${t}-USD`;
}
