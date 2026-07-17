/**
 * Live market-data provider (server-only).
 *
 * When `MARKET_DATA_API_KEY` is configured, this fetches real-time quotes from a
 * market-data API (default: Twelve Data — supports NZX, ASX and US markets on a
 * single key). When no key is present, callers fall back to the deterministic
 * market-intel engine, so the app is fully functional with or without a key.
 *
 * NEVER import this on the client — it reads the secret API key. All failures are
 * logged and swallowed into an empty result so a data-provider outage can never
 * break pricing, reports or the dashboard.
 */

import {
  fetchYahooQuotes,
  fetchYahooNames,
  fetchYahooHistories,
  yahooEquitySymbol,
  yahooCryptoSymbol,
  fetchYahooQuotesBatched,
} from "@/lib/yahoo-finance";
import { fetchGoogleCryptoQuotes, googleCryptoSymbol } from "@/lib/google-finance";

export interface LiveQuote {
  price: number;
  changePct: number; // last-session % change
}

const PROVIDER = (process.env.MARKET_DATA_PROVIDER || "twelvedata").toLowerCase();

// Max symbols to pull from the keyless Yahoo fallback in a single call. The
// fallback is now BATCHED (~45 symbols per HTTP request via the spark endpoint),
// so pricing the full ~400-ticker universe costs only a handful of requests —
// the ceiling is a generous safety valve, high enough that no ticker is ever
// left on its stale synthetic seed when Twelve Data is exhausted.
const YAHOO_FALLBACK_MAX = 600;

/**
 * Equities are ALWAYS live-capable now: when no paid `MARKET_DATA_API_KEY` is
 * set we fall back to the keyless Yahoo Finance feed (NZX / ASX / US), so this
 * returns true unconditionally. It stays a function so callers keep gating
 * live-fetch attempts through one place.
 */
export function isLiveDataConfigured(): boolean {
  return true;
}

/* ------------------------------ Symbol mapping -------------------------- */

/** Map our internal ticker to the provider symbol + country hint. */
function toProviderSymbol(ticker: string): { symbol: string; country?: string } {
  const t = ticker.toUpperCase();
  if (t.endsWith(".NZ")) return { symbol: t.replace(/\.NZ$/, ""), country: "New Zealand" };
  if (t.endsWith(".AX")) return { symbol: t.replace(/\.AX$/, ""), country: "Australia" };
  return { symbol: t }; // US
}

/* ------------------------------- TTL cache ------------------------------ */

const CACHE = new Map<string, LiveQuote>();
let cacheStamp = 0;
const TTL_MS = 60_000; // 1 minute

function readCache(): Record<string, LiveQuote> | null {
  if (!CACHE.size) return null;
  if (Date.now() - cacheStamp > TTL_MS) return null;
  return Object.fromEntries(CACHE);
}

/* -------------------------------- Fetching ------------------------------ */

interface TwelveQuote {
  symbol?: string;
  close?: string | number;
  price?: string | number;
  percent_change?: string | number;
  code?: number; // error responses carry a numeric code
  status?: string;
}

/** Fetch a batch of Twelve Data quotes for one country group. */
async function fetchTwelveBatch(
  key: string,
  tickers: string[],
  country: string | undefined,
  out: Record<string, LiveQuote>
): Promise<void> {
  if (!tickers.length) return;
  const symbolMap = new Map<string, string>(); // providerSymbol -> internal ticker
  tickers.forEach((t) => symbolMap.set(toProviderSymbol(t).symbol, t));
  const symbols = Array.from(symbolMap.keys()).join(",");

  const params = new URLSearchParams({ symbol: symbols, apikey: key, dp: "4" });
  if (country) params.set("country", country);

  const url = `https://api.twelvedata.com/quote?${params.toString()}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    console.error(`[market-data] Twelve Data HTTP ${res.status} for [${symbols}]`);
    return;
  }
  const json = (await res.json()) as Record<string, TwelveQuote> | TwelveQuote;

  // A single-symbol request returns the quote object directly; a multi-symbol
  // request returns an object keyed by symbol.
  const entries: [string, TwelveQuote][] =
    "symbol" in json || "close" in json || "code" in json
      ? [[(json as TwelveQuote).symbol ?? symbols, json as TwelveQuote]]
      : Object.entries(json as Record<string, TwelveQuote>);

  for (const [sym, q] of entries) {
    if (!q || q.code || q.status === "error") continue;
    const internal = symbolMap.get(sym) ?? symbolMap.get(sym.toUpperCase());
    if (!internal) continue;
    const price = Number(q.close ?? q.price);
    const changePct = Number(q.percent_change ?? 0);
    if (isFinite(price) && price > 0) {
      out[internal] = { price, changePct: isFinite(changePct) ? changePct : 0 };
    }
  }
}

/**
 * Keyless Yahoo Finance equity quotes for a set of tickers. Genuine live prices
 * for NZX (.NZ), ASX (.AX) and US symbols with NO API key and no daily limits —
 * used both as the default provider and as the resilient fallback whenever
 * Twelve Data returns nothing (e.g. its 800-credit/day free quota is exhausted).
 */
async function fetchYahooEquityQuotes(tickers: string[]): Promise<Record<string, LiveQuote>> {
  if (!tickers.length) return {};
  const map = Object.fromEntries(tickers.map((t) => [t, yahooEquitySymbol(t)]));
  // Batched spark request (~45 symbols each) — prices the whole universe live in
  // a handful of HTTP calls, so no ticker is left on its stale synthetic seed.
  const yq = await fetchYahooQuotesBatched(map);
  const out: Record<string, LiveQuote> = {};
  for (const [t, q] of Object.entries(yq)) out[t] = { price: q.price, changePct: q.changePct };
  return out;
}

/**
 * Fetch live quotes for a set of tickers. Returns a map keyed by the ORIGINAL
 * ticker (e.g. "BHP.AX"). Always attempts a genuine live quote: Twelve Data first
 * (when a key is set), with keyless Yahoo Finance filling any ticker Twelve Data
 * could not return. Returns {} only when EVERY source fails for EVERY ticker, so
 * callers fall back to the deterministic engine as a last resort.
 */
export async function fetchLiveQuotes(tickers: string[]): Promise<Record<string, LiveQuote>> {
  if (!tickers.length) return {};
  const unique = Array.from(new Set(tickers.map((t) => t.toUpperCase())));

  const key = process.env.MARKET_DATA_API_KEY;

  // DEFAULT (no paid key, or provider explicitly "yahoo"): keyless Yahoo Finance
  // gives genuine live quotes for NZX (.NZ), ASX (.AX) and US symbols.
  if (!key || PROVIDER === "yahoo" || PROVIDER !== "twelvedata") {
    if (key && PROVIDER !== "yahoo" && PROVIDER !== "twelvedata") {
      console.error(`[market-data] Unsupported MARKET_DATA_PROVIDER "${PROVIDER}" — using keyless Yahoo Finance.`);
    }
    return fetchYahooEquityQuotes(unique);
  }

  // Serve from cache when every requested ticker is already fresh.
  const cached = readCache();
  if (cached && unique.every((t) => cached[t])) {
    return Object.fromEntries(unique.map((t) => [t, cached[t]]));
  }

  const out: Record<string, LiveQuote> = {};
  try {
    const groups: Record<string, string[]> = { US: [], AU: [], NZ: [] };
    unique.forEach((t) => {
      if (t.endsWith(".NZ")) groups.NZ.push(t);
      else if (t.endsWith(".AX")) groups.AU.push(t);
      else groups.US.push(t);
    });

    await Promise.all([
      fetchTwelveBatch(key, groups.US, undefined, out),
      fetchTwelveBatch(key, groups.AU, "Australia", out),
      fetchTwelveBatch(key, groups.NZ, "New Zealand", out),
    ]);
    console.log(`[market-data] Twelve Data quotes fetched: ${Object.keys(out).length}/${unique.length} tickers`);
  } catch (err) {
    console.error("[market-data] Twelve Data fetch failed (falling back to Yahoo Finance):", err);
  }

  // Yahoo fallback — fill in every ticker Twelve Data could not return (rate
  // limits, exhausted daily credits, unsupported symbols). This keeps equity
  // prices genuinely LIVE instead of decaying to stale snapshots / synthetics.
  // Yahoo is one request per symbol, so we cap the fallback batch to protect
  // the serverless CPU budget and stay within Yahoo's rate limits. The small,
  // user-facing sets (portfolio holdings, ticker banner, price alerts) are far
  // below the cap and are always filled; only the very large market-intel
  // universe scan is truncated, and only when Twelve Data is unavailable.
  const missing = unique.filter((t) => !out[t]);
  if (missing.length) {
    const batch = missing.slice(0, YAHOO_FALLBACK_MAX);
    if (missing.length > YAHOO_FALLBACK_MAX) {
      console.warn(
        `[market-data] Yahoo fallback capped at ${YAHOO_FALLBACK_MAX}/${missing.length} tickers; the remainder stay on the deterministic engine this request.`
      );
    }
    try {
      const yahoo = await fetchYahooEquityQuotes(batch);
      const filled = Object.keys(yahoo).length;
      if (filled) {
        Object.assign(out, yahoo);
        console.log(`[market-data] Yahoo equity fallback filled ${filled}/${batch.length} tickers`);
      }
    } catch (err) {
      console.error("[market-data] Yahoo equity fallback failed:", err);
    }
  }

  // Refresh the cache with whatever we successfully fetched (from either source).
  if (Object.keys(out).length) {
    Object.entries(out).forEach(([t, q]) => CACHE.set(t, q));
    cacheStamp = Date.now();
  }
  return out;
}

/** Convenience: live price for a single ticker, or null if unavailable. */
export async function fetchLivePrice(ticker: string): Promise<number | null> {
  const quotes = await fetchLiveQuotes([ticker]);
  return quotes[ticker.toUpperCase()]?.price ?? null;
}

/* ============================ Crypto (CoinGecko) ========================= */

/**
 * CoinGecko provides real-time crypto prices with NO API KEY on the free tier,
 * so the Crypto Bot is always live. Symbol → CoinGecko id mapping for our
 * universe; unknown symbols are lower-cased as a best-effort id guess.
 */
const COINGECKO_IDS: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  SOL: "solana",
  BNB: "binancecoin",
  XRP: "ripple",
  ADA: "cardano",
  AVAX: "avalanche-2",
  DOGE: "dogecoin",
  LINK: "chainlink",
  DOT: "polkadot",
  // Polygon migrated MATIC → POL; the legacy "matic-network" id now returns an
  // empty quote on CoinGecko, so we track the live POL token id instead.
  MATIC: "polygon-ecosystem-token",
  POL: "polygon-ecosystem-token",
  LTC: "litecoin",
  UNI: "uniswap",
  ATOM: "cosmos",
  NEAR: "near",
  APT: "aptos",
  ARB: "arbitrum",
  OP: "optimism",
};

function coingeckoId(ticker: string): string {
  const t = ticker.toUpperCase().replace(/-?USD[T]?$/, "");
  return COINGECKO_IDS[t] ?? t.toLowerCase();
}

/** Crypto is live without a key, but allow disabling via env if ever needed. */
export function isCryptoLiveConfigured(): boolean {
  return process.env.CRYPTO_DATA_DISABLED !== "1";
}

const CRYPTO_CACHE = new Map<string, LiveQuote>();
let cryptoStamp = 0;

/**
 * Fetch live crypto quotes from CoinGecko. Returns a map keyed by the ORIGINAL
 * ticker (e.g. "BTC"). Returns {} on any error so callers fall back to the
 * deterministic engine.
 */
export async function fetchCryptoQuotes(tickers: string[]): Promise<Record<string, LiveQuote>> {
  if (!tickers.length || !isCryptoLiveConfigured()) return {};
  const unique = Array.from(new Set(tickers.map((t) => t.toUpperCase())));

  // Serve from cache when fresh.
  if (CRYPTO_CACHE.size && Date.now() - cryptoStamp <= TTL_MS && unique.every((t) => CRYPTO_CACHE.get(t))) {
    return Object.fromEntries(unique.map((t) => [t, CRYPTO_CACHE.get(t)!]));
  }

  // idMap: coingecko id -> internal ticker
  const idMap = new Map<string, string>();
  unique.forEach((t) => idMap.set(coingeckoId(t), t));
  const ids = Array.from(idMap.keys()).join(",");

  const out: Record<string, LiveQuote> = {};
  try {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(
      ids
    )}&vs_currencies=usd&include_24hr_change=true`;
    const headers: Record<string, string> = { Accept: "application/json" };
    if (process.env.COINGECKO_API_KEY) headers["x-cg-demo-api-key"] = process.env.COINGECKO_API_KEY;

    const res = await fetch(url, { headers });
    if (!res.ok) {
      console.error(`[market-data] CoinGecko HTTP ${res.status} for [${ids}]`);
      return {};
    }
    const json = (await res.json()) as Record<string, { usd?: number; usd_24h_change?: number }>;
    for (const [id, q] of Object.entries(json)) {
      const internal = idMap.get(id);
      if (!internal || !q) continue;
      const price = Number(q.usd);
      const changePct = Number(q.usd_24h_change ?? 0);
      if (isFinite(price) && price > 0) {
        out[internal] = { price, changePct: isFinite(changePct) ? changePct : 0 };
      }
    }
    if (Object.keys(out).length) {
      Object.entries(out).forEach(([t, v]) => CRYPTO_CACHE.set(t, v));
      cryptoStamp = Date.now();
    }
    console.log(`[market-data] CoinGecko quotes fetched: ${Object.keys(out).length}/${unique.length} coins`);
  } catch (err) {
    console.error("[market-data] fetchCryptoQuotes failed (falling back to Yahoo):", err);
  }

  // Yahoo fallback — fill any coin CoinGecko could not price (rate limits, or a
  // retired/renamed coin id) so the feed stays live PER-COIN instead of only
  // when the entire CoinGecko call fails. This is what keeps one dead symbol
  // from silently decaying to its stale snapshot while the rest are live.
  const missing = unique.filter((t) => !out[t]);
  if (missing.length) {
    try {
      const map = Object.fromEntries(missing.map((t) => [t, yahooCryptoSymbol(t)]));
      const yq = await fetchYahooQuotes(map);
      let filled = 0;
      for (const [t, q] of Object.entries(yq)) {
        out[t] = { price: q.price, changePct: q.changePct };
        filled++;
      }
      if (filled) {
        Object.entries(out).forEach(([t, v]) => CRYPTO_CACHE.set(t, v));
        cryptoStamp = Date.now();
        console.log(`[market-data] Yahoo crypto fallback filled ${filled}/${missing.length} coins`);
      }
    } catch (err) {
      console.error("[market-data] Yahoo crypto fallback failed:", err);
    }
  }

  // Google Finance fallback — LAST RESORT. If a coin is STILL unpriced after
  // both CoinGecko and Yahoo (rate limits, a retired/renamed id, an outage),
  // scrape its Google Finance quote page: Google always surfaces a current live
  // crypto price, so nothing is left on its stale synthetic seed.
  const stillMissing = unique.filter((t) => !out[t]);
  if (stillMissing.length) {
    try {
      const map = Object.fromEntries(stillMissing.map((t) => [t, googleCryptoSymbol(t)]));
      const gq = await fetchGoogleCryptoQuotes(map);
      let filled = 0;
      for (const [t, q] of Object.entries(gq)) {
        out[t] = { price: q.price, changePct: q.changePct };
        filled++;
      }
      if (filled) {
        Object.entries(out).forEach(([t, v]) => CRYPTO_CACHE.set(t, v));
        cryptoStamp = Date.now();
        console.log(`[market-data] Google Finance crypto fallback filled ${filled}/${stillMissing.length} coins`);
      }
    } catch (err) {
      console.error("[market-data] Google Finance crypto fallback failed:", err);
    }
  }
  return out;
}

/**
 * Unified live-quote fetch by asset class. Stocks use Twelve Data (needs a key);
 * crypto uses CoinGecko (no key). Both fall back gracefully to `{}`.
 */
export async function fetchQuotesForAssetClass(
  tickers: string[],
  assetClass: "stock" | "crypto"
): Promise<Record<string, LiveQuote>> {
  if (assetClass === "crypto") return fetchCryptoQuotes(tickers);
  return isLiveDataConfigured() ? fetchLiveQuotes(tickers) : {};
}

/** Live availability for an asset class (drives the Live/Simulated badge). */
export function isLiveConfiguredFor(assetClass: "stock" | "crypto"): boolean {
  return assetClass === "crypto" ? isCryptoLiveConfigured() : isLiveDataConfigured();
}

/**
 * Fetch REAL recent daily-close histories (keyless Yahoo `spark`, batched) for a
 * set of tickers, keyed by the ORIGINAL internal ticker. These real series are
 * what drive genuine technical signals and 7-day projections — so the dashboard
 * lists reflect each security's ACTUAL momentum and change as the market moves,
 * instead of a frozen synthetic walk. Never throws; returns {} on total failure
 * so the engine falls back to its deterministic series.
 */
export async function fetchHistoriesForAssetClass(
  tickers: string[],
  assetClass: "stock" | "crypto"
): Promise<Record<string, number[]>> {
  if (!tickers.length) return {};
  const unique = Array.from(new Set(tickers.map((t) => t.toUpperCase())));
  const map = Object.fromEntries(
    unique.map((t) => [t, assetClass === "crypto" ? yahooCryptoSymbol(t) : yahooEquitySymbol(t)])
  );
  try {
    return await fetchYahooHistories(map);
  } catch (err) {
    console.error("[market-data] fetchHistoriesForAssetClass failed:", err);
    return {};
  }
}

/* ============================ Company-name resolution ==================== */

/** Human names for the crypto universe (CoinGecko's price endpoint omits names). */
const CRYPTO_NAMES: Record<string, string> = {
  BTC: "Bitcoin",
  ETH: "Ethereum",
  SOL: "Solana",
  BNB: "BNB",
  XRP: "XRP",
  ADA: "Cardano",
  AVAX: "Avalanche",
  DOGE: "Dogecoin",
  LINK: "Chainlink",
  DOT: "Polkadot",
  MATIC: "Polygon (POL)",
  POL: "Polygon",
  LTC: "Litecoin",
  UNI: "Uniswap",
  ATOM: "Cosmos",
  NEAR: "NEAR Protocol",
  APT: "Aptos",
  ARB: "Arbitrum",
  OP: "Optimism",
};

/**
 * Resolve human company/instrument names for a set of tickers so the dashboard
 * never shows a bare symbol (e.g. "WOR.AX") where a name belongs. Equities are
 * named from the keyless Yahoo feed (NZX / ASX / US); crypto uses a curated map.
 * Returns a map keyed by the ORIGINAL ticker; unresolved tickers are simply
 * omitted so callers keep whatever they already had. Never throws.
 */
export async function resolveCompanyNames(
  tickers: Array<{ ticker: string; asset_type?: string }>
): Promise<Record<string, string>> {
  if (!tickers.length) return {};
  const out: Record<string, string> = {};

  const equities = tickers.filter((t) => (t.asset_type || "stock") !== "crypto").map((t) => t.ticker.toUpperCase());
  const cryptos = tickers.filter((t) => (t.asset_type || "stock") === "crypto").map((t) => t.ticker.toUpperCase());

  for (const c of cryptos) {
    const name = CRYPTO_NAMES[c.replace(/-?USD[T]?$/, "")];
    if (name) out[c] = name;
  }

  if (equities.length) {
    try {
      const map = Object.fromEntries(Array.from(new Set(equities)).map((t) => [t, yahooEquitySymbol(t)]));
      const names = await fetchYahooNames(map);
      Object.assign(out, names);
    } catch (err) {
      console.error("[market-data] resolveCompanyNames (equities) failed:", err);
    }
  }

  return out;
}
