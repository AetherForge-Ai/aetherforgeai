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
  name?: string; // resolved company/instrument name (from chart meta), when available
}

/**
 * Clean a raw Yahoo instrument name into a human company name.
 * Yahoo `longName` is already clean ("Worley Limited"); `shortName` can carry
 * listing noise ("WORLEY FPO [WOR]"), so we strip the trailing "[TICKER]" tag
 * and common share-class tokens (FPO / ORD / CDI …) when we fall back to it.
 */
function cleanInstrumentName(raw: unknown): string | undefined {
  const s = String(raw ?? "").trim();
  if (!s) return undefined;
  const cleaned = s
    .replace(/\s*\[[^\]]*\]\s*$/, "") // drop trailing "[WOR]"
    .replace(/\s+\b(FPO|ORD|CDI|NPV|NVS|REIT|UNITS?|STAPLED)\b\.?$/i, "")
    .trim();
  return cleaned || s;
}

const BASE = "https://query1.finance.yahoo.com/v8/finance/chart";
const SEARCH_BASE = "https://query1.finance.yahoo.com/v1/finance/search";
const TTL_MS = 60_000; // 1 minute
const CONCURRENCY = 8;

// Yahoo blocks requests without a browser-like UA.
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36";

const CACHE = new Map<string, { quote: YahooQuote; at: number }>();

/** Fetch a single Yahoo symbol's current quote, or null on any failure. */
async function fetchOne(yahooSymbol: string): Promise<YahooQuote | null> {
  const cached = CACHE.get(yahooSymbol);
  if (cached && Date.now() - cached.at <= TTL_MS) return cached.quote;

  try {
    const url = `${BASE}/${encodeURIComponent(yahooSymbol)}?interval=1d&range=1d`;
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
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
      name: cleanInstrumentName(meta.longName) ?? cleanInstrumentName(meta.shortName),
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

/**
 * Resolve human company/instrument names for a set of internal tickers.
 * @param map internalTicker → yahooSymbol (e.g. { "WOR.AX": "WOR.AX", BTC: "BTC-USD" })
 * @returns internalTicker → company name (only tickers Yahoo could name are included)
 * Reuses the same quote fetch (and its cache), so this adds no extra HTTP cost
 * when prices were just fetched for the same symbols.
 */
export async function fetchYahooNames(map: Record<string, string>): Promise<Record<string, string>> {
  const quotes = await fetchYahooQuotes(map);
  const out: Record<string, string> = {};
  for (const [internal, q] of Object.entries(quotes)) {
    if (q.name) out[internal] = q.name;
  }
  console.log(`[yahoo] Resolved names for ${Object.keys(out).length}/${Object.keys(map).length} tickers`);
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

/** Convenience: fetch a single symbol's live quote (or null). */
export async function fetchYahooQuote(symbol: string): Promise<YahooQuote | null> {
  return fetchOne(yahooEquitySymbol(symbol));
}

/* ============================ Symbol search ============================= */

export interface YahooSymbolMatch {
  symbol: string; // Yahoo symbol, e.g. "CBA.AX", "FPH.NZ", "AAPL"
  name: string; // company name
  exchange: string; // raw Yahoo exchange code
  exchangeLabel: string; // friendly market label: ASX / NZX / NASDAQ / NYSE
}

/**
 * Markets the owner asked to cover: ASX (Australia), NZX (New Zealand), the
 * NASDAQ tiers, and NYSE (which — together with NASDAQ — lists every Dow Jones
 * Industrial Average component). Any other exchange (Frankfurt, OTC, etc.) is
 * filtered out so the picker only surfaces the requested universes.
 */
const EXCHANGE_LABELS: Record<string, string> = {
  ASX: "ASX",
  NZE: "NZX",
  NMS: "NASDAQ",
  NAS: "NASDAQ",
  NGM: "NASDAQ",
  NCM: "NASDAQ",
  NYQ: "NYSE",
};

const SEARCH_TTL_MS = 5 * 60_000; // 5 minutes
const SEARCH_CACHE = new Map<string, { at: number; results: YahooSymbolMatch[] }>();

/**
 * Live keyless symbol search across ASX / NZX / NASDAQ / NYSE. Returns matching
 * equities (symbol + company name + market label). Cached briefly and degrades
 * to an empty list on any failure so the picker never breaks.
 */
export async function searchYahooSymbols(query: string, limit = 12): Promise<YahooSymbolMatch[]> {
  const q = (query || "").trim();
  if (!q) return [];

  const key = q.toLowerCase();
  const cached = SEARCH_CACHE.get(key);
  if (cached && Date.now() - cached.at <= SEARCH_TTL_MS) return cached.results.slice(0, limit);

  try {
    const url = `${SEARCH_BASE}?q=${encodeURIComponent(q)}&quotesCount=30&newsCount=0&listsCount=0&enableFuzzyQuery=false`;
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
    if (!res.ok) {
      console.error(`[yahoo] search HTTP ${res.status} for "${q}"`);
      return [];
    }
    const json = (await res.json()) as { quotes?: Array<Record<string, any>> };
    const quotes = json?.quotes ?? [];

    const results: YahooSymbolMatch[] = [];
    const seen = new Set<string>();
    for (const item of quotes) {
      if (item?.quoteType !== "EQUITY") continue;
      const label = EXCHANGE_LABELS[String(item.exchange)];
      if (!label) continue; // only ASX / NZX / NASDAQ / NYSE
      const symbol = String(item.symbol || "").toUpperCase();
      if (!symbol || seen.has(symbol)) continue;
      seen.add(symbol);
      results.push({
        symbol,
        name: String(item.longname || item.shortname || symbol),
        exchange: String(item.exchange),
        exchangeLabel: label,
      });
    }

    SEARCH_CACHE.set(key, { at: Date.now(), results });
    console.log(`[yahoo] search "${q}" → ${results.length} ASX/NZX/NASDAQ/NYSE matches`);
    return results.slice(0, limit);
  } catch (err) {
    console.error(`[yahoo] search failed for "${q}":`, err);
    return [];
  }
}
