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

export interface LiveQuote {
  price: number;
  changePct: number; // last-session % change
}

const PROVIDER = (process.env.MARKET_DATA_PROVIDER || "twelvedata").toLowerCase();

export function isLiveDataConfigured(): boolean {
  return !!process.env.MARKET_DATA_API_KEY;
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
 * Fetch live quotes for a set of tickers. Returns a map keyed by the ORIGINAL
 * ticker (e.g. "BHP.AX"). Returns {} when no key is configured or on any error.
 */
export async function fetchLiveQuotes(tickers: string[]): Promise<Record<string, LiveQuote>> {
  const key = process.env.MARKET_DATA_API_KEY;
  if (!key || !tickers.length) return {};

  const unique = Array.from(new Set(tickers.map((t) => t.toUpperCase())));

  // Serve from cache when every requested ticker is already fresh.
  const cached = readCache();
  if (cached && unique.every((t) => cached[t])) {
    return Object.fromEntries(unique.map((t) => [t, cached[t]]));
  }

  if (PROVIDER !== "twelvedata") {
    console.error(`[market-data] Unsupported MARKET_DATA_PROVIDER "${PROVIDER}" — falling back to deterministic engine.`);
    return {};
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

    // Refresh the cache with whatever we successfully fetched.
    if (Object.keys(out).length) {
      Object.entries(out).forEach(([t, q]) => CACHE.set(t, q));
      cacheStamp = Date.now();
    }
    console.log(`[market-data] Live quotes fetched: ${Object.keys(out).length}/${unique.length} tickers`);
  } catch (err) {
    console.error("[market-data] fetchLiveQuotes failed (falling back to deterministic engine):", err);
    return {};
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
  MATIC: "matic-network",
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
    console.error("[market-data] fetchCryptoQuotes failed (falling back to deterministic engine):", err);
    return {};
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
