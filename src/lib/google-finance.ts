/**
 * Google Finance live-price scraper — SERVER-ONLY, KEYLESS.
 *
 * LAST-RESORT crypto price source. When BOTH CoinGecko and the keyless Yahoo
 * fallback fail to price a coin (rate limits, a retired/renamed id, an outage),
 * we scrape the coin's Google Finance quote page — Google always surfaces a
 * current live price for a crypto pair, so this guarantees the Crypto Bot never
 * shows a stale synthetic seed.
 *
 * It parses the rendered quote page (no API key, no JS execution needed — the
 * price is in the server-rendered HTML). Google's obfuscated CSS class names
 * rotate occasionally, so the parser tries several strategies and also anchors
 * on STABLE `jsname` attributes (which Google's framework keeps constant) rather
 * than on class names alone. NEVER import this on the client. Every failure is
 * logged and degrades to an empty result so a Google change can never break
 * pricing — the deterministic engine still backs everything up.
 */

import "server-only";

export interface GoogleQuote {
  price: number;
  changePct: number; // vs previous close, %
}

const TTL_MS = 60_000; // 1 minute
const CONCURRENCY = 4; // last-resort + external HTML, so keep it gentle
const FETCH_TIMEOUT_MS = 7_000;

// Browser-like UA so Google serves the full quote page (not a stripped variant).
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36";

const CACHE = new Map<string, { quote: GoogleQuote; at: number }>();

/** Parse a Google-formatted number ("62,856.15", "0.0717") into a float. */
function parseNum(raw: string | undefined): number {
  if (!raw) return NaN;
  return Number(raw.replace(/,/g, "").trim());
}

/**
 * Locate the MAIN quote price and where it ends in the HTML. A Google Finance
 * page carries many quotes (related coins, comparisons), so we anchor on the
 * subject's price header. Tries, in order: (1) the current beta price container
 * `.N6SYTe`, (2) the classic desktop container `.YMlKec.fxKbKc`, (3) a
 * structural anchor on the change-arrow element `jsname="ohpORc"` (which
 * immediately follows the price, independent of the price container's class).
 * Returns { price, end } where `end` is the index just after the match — the
 * change % is parsed from the region that starts there, keeping price and
 * change from the SAME quote. Returns null if none match.
 */
function locatePrice(html: string): { price: number; end: number } | null {
  const strategies: RegExp[] = [
    // (1) Current beta layout: <div class="... N6SYTe"><span jsname><span>PRICE
    /N6SYTe"><span[^>]*>(?:<span[^>]*>)?<span>([\d,]+\.?\d*)</,
    // (2) Classic desktop layout: <div class="YMlKec fxKbKc">$PRICE
    /class="YMlKec fxKbKc">\$?([\d,]+\.?\d*)/,
    // (3) Structural: the price <span> sits directly before the change-arrow
    //     block (jsname="ohpORc"). jsname is stable even when classes rotate.
    /<span>([\d,]+\.?\d*)<\/span><\/span><\/div><div[^>]*><div jsname="ohpORc"/,
  ];
  for (const re of strategies) {
    const m = html.match(re);
    const n = parseNum(m?.[1]);
    if (m && isFinite(n) && n > 0) return { price: n, end: (m.index ?? 0) + m[0].length };
  }
  return null;
}

/**
 * Extract the session % change from the region IMMEDIATELY AFTER the main price
 * (so it belongs to the subject coin, not a related-coins widget elsewhere on
 * the page). The value lives in the `jsname="vY9t3b"` span ("-1.49%") and the
 * direction is confirmed by the adjacent arrow icon (`arrow_downward` =
 * negative). Returns 0 when it can't be parsed — a last-resort price with a flat
 * change is still far better than a stale seed.
 */
function parseChangePctAfter(html: string, start: number): number {
  // Only look at the change block that directly trails the price.
  const window = html.slice(start, start + 500);
  const m = window.match(/jsname="vY9t3b"[^>]*>(?:<span[^>]*>)?<span[^>]*>\s*([+\-]?[\d,]*\.?\d+)\s*%/);
  let pct = parseNum(m?.[1]);
  if (!isFinite(pct)) return 0;
  // If the text carried no explicit sign, use the arrow icon direction.
  if (!/[+\-]/.test(m?.[1] ?? "") && /arrow_downward/.test(window.slice(0, m?.index ?? 0))) {
    pct = -Math.abs(pct);
  }
  return pct;
}

/** Fetch with a hard timeout so a slow Google response can't stall a request. */
async function fetchWithTimeout(url: string): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html", "Accept-Language": "en-US,en;q=0.9" },
      signal: controller.signal,
      redirect: "follow",
    });
  } catch (err) {
    console.error(`[google-finance] fetch failed for ${url}:`, err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch a single Google Finance quote (e.g. "BTC-USD"), or null on any failure.
 * `hl=en&gl=US` keeps Google from serving a regional consent interstitial.
 */
async function fetchOne(googleSymbol: string): Promise<GoogleQuote | null> {
  const cached = CACHE.get(googleSymbol);
  if (cached && Date.now() - cached.at <= TTL_MS) return cached.quote;

  const url = `https://www.google.com/finance/quote/${encodeURIComponent(googleSymbol)}?hl=en&gl=US`;
  const res = await fetchWithTimeout(url);
  if (!res) return null;
  if (!res.ok) {
    console.error(`[google-finance] HTTP ${res.status} for ${googleSymbol}`);
    return null;
  }

  const html = await res.text();
  const located = locatePrice(html);
  if (!located) {
    console.error(`[google-finance] Could not parse a price for ${googleSymbol} (layout may have changed)`);
    return null;
  }
  const { price, end } = located;
  const changePct = parseChangePctAfter(html, end);
  const quote: GoogleQuote = { price, changePct };
  CACHE.set(googleSymbol, { quote, at: Date.now() });
  console.log(`[google-finance] ${googleSymbol} → $${price} (${changePct >= 0 ? "+" : ""}${changePct}%)`);
  return quote;
}

/** Run tasks with bounded concurrency so we never hammer Google. */
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

/** Map an internal crypto ticker to its Google Finance symbol (BTC → BTC-USD). */
export function googleCryptoSymbol(ticker: string): string {
  const t = ticker.toUpperCase().replace(/-?USDT?$/, "");
  return `${t}-USD`;
}

/**
 * Fetch live crypto quotes from Google Finance for a set of internal tickers.
 * @param map internalTicker → googleSymbol (e.g. { BTC: "BTC-USD", DOGE: "DOGE-USD" })
 * @returns internalTicker → { price, changePct } (only successfully scraped coins).
 * Never throws; returns {} on total failure.
 */
export async function fetchGoogleCryptoQuotes(
  map: Record<string, string>
): Promise<Record<string, GoogleQuote>> {
  const entries = Object.entries(map);
  if (!entries.length) return {};

  const quotes = await mapLimited(entries, CONCURRENCY, async ([internal, gSym]) => {
    const q = await fetchOne(gSym);
    return [internal, q] as const;
  });

  const out: Record<string, GoogleQuote> = {};
  for (const [internal, q] of quotes) if (q) out[internal] = q;
  console.log(`[google-finance] Resolved ${Object.keys(out).length}/${entries.length} crypto quotes`);
  return out;
}
