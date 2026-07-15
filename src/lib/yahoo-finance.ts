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
  changeAbs: number; // vs previous close, absolute currency move
  prevClose: number; // previous session close
  currency: string;
  name?: string; // resolved company/instrument name (from chart meta), when available
  volume?: number; // regular-market session volume, when available
  dayHigh?: number; // session high, when available
  dayLow?: number; // session low, when available
  open?: number; // session open, when available
  fiftyTwoWeekHigh?: number; // 52-week high, when available
  fiftyTwoWeekLow?: number; // 52-week low, when available
  marketCap?: number; // market capitalisation, when Yahoo exposes it on chart meta
  exchangeLabel?: string; // friendly exchange label (ASX / NZX / NASDAQ / NYSE), when resolvable
  exchangeTimezone?: string; // IANA timezone of the listing exchange, when available
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
    const vol = Number(meta.regularMarketVolume);
    // Optional structural stats — all present on the chart `meta` for equities.
    const num = (v: unknown): number | undefined => {
      const n = Number(v);
      return isFinite(n) && n > 0 ? n : undefined;
    };
    const quote: YahooQuote = {
      price,
      changePct: isFinite(changePct) ? changePct : 0,
      changeAbs: isFinite(price - prevClose) ? price - prevClose : 0,
      prevClose: prevClose > 0 ? prevClose : price,
      currency: typeof meta.currency === "string" ? meta.currency : "USD",
      name: cleanInstrumentName(meta.longName) ?? cleanInstrumentName(meta.shortName),
      volume: isFinite(vol) && vol > 0 ? vol : undefined,
      dayHigh: num(meta.regularMarketDayHigh),
      dayLow: num(meta.regularMarketDayLow),
      open: num(meta.regularMarketOpen ?? meta.open),
      fiftyTwoWeekHigh: num(meta.fiftyTwoWeekHigh),
      fiftyTwoWeekLow: num(meta.fiftyTwoWeekLow),
      marketCap: num(meta.marketCap),
      exchangeLabel: EXCHANGE_LABELS[String(meta.exchangeName)],
      exchangeTimezone:
        typeof meta.exchangeTimezoneName === "string" ? meta.exchangeTimezoneName : undefined,
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

/* ============================ Real price history ======================== */

const SPARK_BASE = "https://query1.finance.yahoo.com/v8/finance/spark";
const HIST_TTL_MS = 10 * 60_000; // 10 minutes — real daily closes only change once a day
// Symbols per batched spark request. Yahoo's spark endpoint rejects large symbol
// lists with HTTP 400 (empirically it 400s at ~25 symbols), so we keep the batch
// at 20 — the largest size that returns 200 reliably. At 45 EVERY request 400'd,
// silently starving both live quotes and real histories back to synthetic seeds.
const HIST_CHUNK = 20; // symbols per batched spark request (Yahoo caps ~20)
const HIST_CACHE = new Map<string, { closes: number[]; at: number }>();

/**
 * Batched REAL daily-close history via Yahoo's keyless `spark` endpoint. One HTTP
 * request returns the close series for up to ~45 symbols at once, so the full
 * market universe is covered in a handful of requests (versus one-per-symbol).
 *
 * This is what makes the dashboard's signals and 7-day projections reflect the
 * stock's ACTUAL recent behaviour (real momentum, real trend) instead of a
 * synthetic seeded walk — so "top performers" are genuinely the strong movers
 * and the lists change as the market moves.
 *
 * @param map internalTicker → yahooSymbol
 * @returns internalTicker → array of real daily closes (oldest→newest), only for
 *          symbols Yahoo returned a usable series for.
 */
export async function fetchYahooHistories(
  map: Record<string, string>,
  range = "6mo",
  interval = "1d"
): Promise<Record<string, number[]>> {
  const entries = Object.entries(map);
  if (!entries.length) return {};

  const out: Record<string, number[]> = {};
  const stale: [string, string][] = [];

  // Serve fresh entries from cache; collect the rest for fetching.
  for (const [internal, ySym] of entries) {
    const cached = HIST_CACHE.get(ySym);
    if (cached && Date.now() - cached.at <= HIST_TTL_MS) {
      out[internal] = cached.closes;
    } else {
      stale.push([internal, ySym]);
    }
  }
  if (!stale.length) return out;

  // Chunk the stale symbols into batched spark requests.
  const chunks: [string, string][][] = [];
  for (let i = 0; i < stale.length; i += HIST_CHUNK) chunks.push(stale.slice(i, i + HIST_CHUNK));

  await mapLimited(chunks, CONCURRENCY, async (chunk) => {
    const symbols = chunk.map(([, y]) => y).join(",");
    try {
      const url = `${SPARK_BASE}?symbols=${encodeURIComponent(symbols)}&range=${range}&interval=${interval}`;
      const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
      if (!res.ok) {
        console.error(`[yahoo] spark HTTP ${res.status} for ${chunk.length} symbols`);
        return;
      }
      const json = (await res.json()) as Record<string, any>;
      // query1 returns a flat map keyed by symbol; some hosts wrap in spark.result.
      const bySymbol: Record<string, any> = {};
      if (json?.spark?.result && Array.isArray(json.spark.result)) {
        for (const r of json.spark.result) {
          const resp = r?.response?.[0];
          const closes = resp?.indicators?.quote?.[0]?.close;
          if (r?.symbol && Array.isArray(closes)) bySymbol[r.symbol] = { close: closes };
        }
      } else {
        Object.assign(bySymbol, json);
      }

      for (const [internal, ySym] of chunk) {
        const node = bySymbol[ySym];
        const raw = node?.close;
        if (!Array.isArray(raw)) continue;
        const closes = raw.map((v: any) => Number(v)).filter((v: number) => isFinite(v) && v > 0);
        if (closes.length >= 40) {
          out[internal] = closes;
          HIST_CACHE.set(ySym, { closes, at: Date.now() });
        }
      }
    } catch (err) {
      console.error(`[yahoo] spark fetch failed for a chunk of ${chunk.length}:`, err);
    }
  });

  console.log(`[yahoo] Real histories resolved for ${Object.keys(out).length}/${entries.length} tickers`);
  return out;
}

/**
 * BATCHED live quotes via Yahoo's keyless `spark` endpoint — one HTTP request
 * prices up to ~45 symbols at once (latest intraday close + previous close for
 * the % change), so the ENTIRE market universe (~400 tickers) is priced live in
 * a handful of requests instead of one-request-per-symbol.
 *
 * This is what lets every ticker (e.g. NASDAQ `LIN`) show its genuine live price
 * even when the paid provider is rate-limited: previously the per-symbol Yahoo
 * fallback was capped to protect the CPU budget, so tickers past the cap decayed
 * to their stale synthetic seed. Batching removes that cost, so nothing is left
 * on synthetic data. Reuses (and warms) the same 60s single-quote CACHE, and
 * degrades to `{}` on any failure so pricing can never break.
 *
 * @param map internalTicker → yahooSymbol (e.g. { LIN: "LIN", "BHP.AX": "BHP.AX" })
 * @returns internalTicker → { price, changePct } for every symbol Yahoo priced.
 */
export async function fetchYahooQuotesBatched(
  map: Record<string, string>
): Promise<Record<string, { price: number; changePct: number }>> {
  const entries = Object.entries(map);
  if (!entries.length) return {};

  const out: Record<string, { price: number; changePct: number }> = {};
  const stale: [string, string][] = [];

  // Serve fresh entries straight from the single-quote cache (populated by
  // fetchOne / this function) so a repeat scan within the TTL costs nothing.
  for (const [internal, ySym] of entries) {
    const c = CACHE.get(ySym);
    if (c && Date.now() - c.at <= TTL_MS) {
      out[internal] = { price: c.quote.price, changePct: c.quote.changePct };
    } else {
      stale.push([internal, ySym]);
    }
  }
  if (!stale.length) return out;

  const chunks: [string, string][][] = [];
  for (let i = 0; i < stale.length; i += HIST_CHUNK) chunks.push(stale.slice(i, i + HIST_CHUNK));

  await mapLimited(chunks, CONCURRENCY, async (chunk) => {
    const symbols = chunk.map(([, y]) => y).join(",");
    try {
      // range=1d&interval=5m → an intraday close series; the last finite point is
      // the most recent traded price, and `chartPreviousClose` drives the change%.
      const url = `${SPARK_BASE}?symbols=${encodeURIComponent(symbols)}&range=1d&interval=5m`;
      const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
      if (!res.ok) {
        console.error(`[yahoo] live-batch HTTP ${res.status} for ${chunk.length} symbols`);
        return;
      }
      const json = (await res.json()) as Record<string, any>;
      // query1 returns a flat map keyed by symbol; some hosts wrap in spark.result.
      const bySymbol: Record<string, any> = {};
      if (json?.spark?.result && Array.isArray(json.spark.result)) {
        for (const r of json.spark.result) {
          const resp = r?.response?.[0];
          if (r?.symbol) {
            bySymbol[r.symbol] = {
              close: resp?.indicators?.quote?.[0]?.close,
              chartPreviousClose: resp?.meta?.chartPreviousClose ?? resp?.meta?.previousClose,
            };
          }
        }
      } else {
        Object.assign(bySymbol, json);
      }

      for (const [internal, ySym] of chunk) {
        const node = bySymbol[ySym];
        if (!node) continue;
        const raw = Array.isArray(node.close) ? node.close : [];
        const closes = raw.map((v: any) => Number(v)).filter((v: number) => isFinite(v) && v > 0);
        const price = closes.length ? closes[closes.length - 1] : NaN;
        if (!isFinite(price) || price <= 0) continue;
        const prevClose = Number(node.chartPreviousClose ?? node.previousClose ?? price);
        const changePct = prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0;
        out[internal] = { price, changePct: isFinite(changePct) ? changePct : 0 };
      }
    } catch (err) {
      console.error(`[yahoo] live-batch fetch failed for a chunk of ${chunk.length}:`, err);
    }
  });

  console.log(`[yahoo] Batched live quotes resolved for ${Object.keys(out).length}/${entries.length} tickers`);
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
 * Directly probe ONE Yahoo symbol via the chart endpoint. Returns a match only
 * if it's a live equity on a covered exchange (ASX / NZX / NASDAQ / NYSE).
 *
 * This is the safety net that guarantees an exact ASX/NZX ticker always resolves.
 * Yahoo's name-search ranks globally and frequently buries or omits the primary
 * antipodean listing — e.g. searching "WBC" surfaces Westpac's German and
 * preference-share lines but NOT the ordinary `WBC.AX` — so a bare ticker would
 * otherwise appear "missing" from the picker.
 */
async function probeSymbol(symbol: string): Promise<YahooSymbolMatch | null> {
  try {
    const url = `${BASE}/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      chart?: { result?: Array<{ meta?: Record<string, any> }> };
    };
    const meta = json?.chart?.result?.[0]?.meta;
    if (!meta) return null;

    const price = Number(meta.regularMarketPrice);
    if (!isFinite(price) || price <= 0) return null; // delisted / no data

    const label = EXCHANGE_LABELS[String(meta.exchangeName)];
    if (!label) return null; // only ASX / NZX / NASDAQ / NYSE

    const sym = String(meta.symbol || symbol).toUpperCase();
    return {
      symbol: sym,
      name: cleanInstrumentName(meta.longName) ?? cleanInstrumentName(meta.shortName) ?? sym,
      exchange: String(meta.exchangeName),
      exchangeLabel: label,
    };
  } catch {
    return null;
  }
}

/** Yahoo's name/keyword search — good for company names ("Commonwealth", "Apple"). */
async function nameSearch(q: string): Promise<YahooSymbolMatch[]> {
  try {
    const url = `${SEARCH_BASE}?q=${encodeURIComponent(q)}&quotesCount=40&newsCount=0&listsCount=0&enableFuzzyQuery=false`;
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
    if (!res.ok) {
      console.error(`[yahoo] search HTTP ${res.status} for "${q}"`);
      return [];
    }
    const json = (await res.json()) as { quotes?: Array<Record<string, any>> };
    const out: YahooSymbolMatch[] = [];
    for (const item of json?.quotes ?? []) {
      if (item?.quoteType !== "EQUITY") continue;
      const label = EXCHANGE_LABELS[String(item.exchange)];
      if (!label) continue; // only ASX / NZX / NASDAQ / NYSE
      const symbol = String(item.symbol || "").toUpperCase();
      if (!symbol) continue;
      out.push({
        symbol,
        name: cleanInstrumentName(item.longname || item.shortname) ?? symbol,
        exchange: String(item.exchange),
        exchangeLabel: label,
      });
    }
    return out;
  } catch (err) {
    console.error(`[yahoo] name search failed for "${q}":`, err);
    return [];
  }
}

/**
 * Live keyless symbol search across ASX / NZX / NASDAQ / NYSE. Returns matching
 * equities (symbol + company name + market label). Cached briefly and degrades
 * to an empty list on any failure so the picker never breaks.
 *
 * Combines two strategies so nothing that trades on the four covered exchanges
 * goes missing:
 *   1. Direct ticker probe — if the query looks like a bare ticker we hit the
 *      quote endpoint for its `.AX` (ASX), `.NZ` (NZX) and bare (US) listings and
 *      surface any that are live. These lead the list (exact-symbol intent).
 *   2. Name/keyword search — Yahoo's fuzzy lookup for company-name queries.
 */
export async function searchYahooSymbols(query: string, limit = 12): Promise<YahooSymbolMatch[]> {
  const q = (query || "").trim();
  if (!q) return [];

  const key = q.toLowerCase();
  const cached = SEARCH_CACHE.get(key);
  if (cached && Date.now() - cached.at <= SEARCH_TTL_MS) return cached.results.slice(0, limit);

  // Build direct-probe candidates for ticker-shaped queries.
  const probes: string[] = [];
  const bare = q.toUpperCase();
  if (/^[A-Z0-9]{1,6}\.(AX|NZ)$/i.test(q)) {
    probes.push(bare); // user already typed a suffix (WBC.AX)
  } else if (/^[A-Z0-9]{1,6}$/i.test(q)) {
    probes.push(`${bare}.AX`, `${bare}.NZ`, bare); // ASX, NZX, then US
  }

  const [probeResults, named] = await Promise.all([
    Promise.all(probes.map(probeSymbol)),
    nameSearch(q),
  ]);

  // Merge: exact ticker hits first, then name matches. De-dupe by symbol.
  const results: YahooSymbolMatch[] = [];
  const seen = new Set<string>();
  for (const m of [...probeResults.filter((x): x is YahooSymbolMatch => !!x), ...named]) {
    if (seen.has(m.symbol)) continue;
    seen.add(m.symbol);
    results.push(m);
  }

  SEARCH_CACHE.set(key, { at: Date.now(), results });
  console.log(
    `[yahoo] search "${q}" → ${results.length} matches (${probeResults.filter(Boolean).length} direct, ${named.length} named)`,
  );
  return results.slice(0, limit);
}
