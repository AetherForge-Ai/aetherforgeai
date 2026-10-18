/**
 * Market-data provider (server-only).
 *
 * Equity quotes come from keyless Yahoo Finance (NZX, ASX and US). Crypto quotes
 * use the public price chain, CoinGecko first. Failures are logged and swallowed
 * into an empty result so a data-provider outage does not break pricing, reports
 * or the dashboard.
 *
 * NEVER import this on the client.
 */

import { coinGeckoEndpoint } from "@/lib/coingecko-auth";
import {
  fetchYahooNames,
  fetchYahooHistories,
  yahooEquitySymbol,
  yahooCryptoSymbol,
  fetchYahooQuotesBatched,
} from "@/lib/yahoo-finance";
import { CRYPTO_SNAPSHOT_TTL_MS, normalizeCryptoSymbols, stampCryptoQuoteLive } from "@/lib/crypto-live";
import { acceptCryptoPrint, fillMissingPublicQuotes } from "@/lib/crypto-price-feed";
import { publicSourceAllowed } from "@/lib/swyftx-display";
import { canonicalCryptoId } from "@/lib/crypto-ids";
import { bullionDisplayName, isBullionHolding } from "@/lib/metal-valuation";
import { cryptoFreshnessLabel, latestQuoteTime } from "@/lib/market-freshness";

export interface LiveQuote {
  price: number;
  changePct: number; // last-session % change
  /** Present when the feed could tell live vs last session close. */
  asOf?: "live" | "close";
  /** Vendor quote time. Fetch time is not stored here. */
  quotedAt?: string;
  /** Which feed produced this print. */
  source?: string;
  /** True when this is the last price that passed the sanity check. */
  stale?: boolean;
}

/**
 * Equities are quoted from keyless Yahoo Finance (NZX, ASX and US), so this
 * returns true unconditionally. It stays a function so callers keep gating
 * quote attempts through one place.
 */
export function isLiveDataConfigured(): boolean {
  return true;
}

/* ------------------------------- TTL cache ------------------------------ */

const CACHE = new Map<string, LiveQuote>();
const liveQuoteInflight = new Map<string, Promise<Record<string, LiveQuote>>>();
const cryptoQuoteInflight = new Map<string, Promise<Record<string, LiveQuote>>>();
let cacheStamp = 0;
const TTL_MS = 60_000; // 1 minute

function readCache(): Record<string, LiveQuote> | null {
  if (!CACHE.size) return null;
  if (Date.now() - cacheStamp > TTL_MS) return null;
  return Object.fromEntries(CACHE);
}

/* -------------------------------- Fetching ------------------------------ */

/**
 * Keyless Yahoo Finance equity quotes for a set of tickers.
 * NZX (.NZ), ASX (.AX) and US symbols, with no API key.
 */
async function fetchYahooEquityQuotes(tickers: string[]): Promise<Record<string, LiveQuote>> {
  if (!tickers.length) return {};
  const map = Object.fromEntries(tickers.map((t) => [t, yahooEquitySymbol(t)]));
  // Batched spark request (~45 symbols each) — prices the whole universe live in
  // a handful of HTTP calls, so no ticker is left on its stale synthetic seed.
  const yq = await fetchYahooQuotesBatched(map);
  const out: Record<string, LiveQuote> = {};
  for (const [t, q] of Object.entries(yq)) {
    out[t] = { price: q.price, changePct: q.changePct, asOf: q.asOf, ...(q.quotedAt ? { quotedAt: q.quotedAt } : {}) };
  }
  return out;
}

/**
 * Fetch quotes for a set of tickers. Returns a map keyed by the ORIGINAL
 * ticker (e.g. "BHP.AX"). Quotes come from keyless Yahoo Finance.
 * Returns {} only when that feed fails for every ticker.
 */
export async function fetchLiveQuotes(tickers: string[]): Promise<Record<string, LiveQuote>> {
  if (!tickers.length) return {};
  const unique = Array.from(new Set(tickers.map((t) => t.toUpperCase()))).sort();
  const flightKey = unique.join(",");
  const pending = liveQuoteInflight.get(flightKey);
  if (pending) return pending;
  const work = loadLiveQuotes(unique).finally(() => {
    if (liveQuoteInflight.get(flightKey) === work) liveQuoteInflight.delete(flightKey);
  });
  liveQuoteInflight.set(flightKey, work);
  return work;
}

async function loadLiveQuotes(unique: string[]): Promise<Record<string, LiveQuote>> {
  const fresh = readCache();
  if (fresh && unique.every((t) => fresh[t])) {
    return Object.fromEntries(unique.map((t) => [t, fresh[t]]));
  }
  const yahoo = await fetchYahooEquityQuotes(unique);
  if (Object.keys(yahoo).length) {
    Object.entries(yahoo).forEach(([t, q]) => CACHE.set(t, q));
    cacheStamp = Date.now();
  }
  return yahoo;
}

/** Convenience: live price for a single ticker, or null if unavailable. */
export async function fetchLivePrice(ticker: string): Promise<number | null> {
  const quotes = await fetchLiveQuotes([ticker]);
  return quotes[ticker.toUpperCase()]?.price ?? null;
}

/* ============================ Crypto (CoinGecko) ========================= */

/**
 * CoinGecko prices need no API key on the demo tier. They can be delayed.
 * Symbol → CoinGecko id mapping for our universe; unknown symbols are
 * lower-cased as a best-effort id guess.
 */
/** Canonical IDs live in crypto-ids.ts (including JUP → jupiter-exchange-solana). */
function coingeckoId(ticker: string): string {
  return canonicalCryptoId(ticker);
}

function isoFromUnix(value: unknown): string | undefined {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  const ms = n > 1e12 ? n : n * 1000;
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

/**
 * Stamp vendor quote times onto coins that already have a price.
 * Prices already chosen are left untouched.
 */
async function fillMissingCryptoQuoteTimes(
  quotes: Record<string, LiveQuote>,
  ids?: Record<string, string>
): Promise<void> {
  const missing = Object.keys(quotes).filter((t) => quotes[t]?.price > 0 && !quotes[t]?.quotedAt);
  if (!missing.length) return;
  const idMap = new Map<string, string>();
  missing.forEach((t) => {
    const id = ids?.[t] || coingeckoId(t);
    const existing = idMap.get(id);
    if (existing && existing !== t) return;
    idMap.set(id, t);
  });
  const idList = Array.from(idMap.keys()).join(",");
  try {
    const endpoint = coinGeckoEndpoint();
    const url = `${endpoint.base}/simple/price?ids=${encodeURIComponent(
      idList
    )}&vs_currencies=usd&include_last_updated_at=true`;
    const res = await fetch(url, { headers: endpoint.headers });
    if (!res.ok) return;
    const json = (await res.json()) as Record<string, { last_updated_at?: number }>;
    for (const [id, row] of Object.entries(json)) {
      const internal = idMap.get(id);
      if (!internal || !quotes[internal] || quotes[internal].quotedAt) continue;
      const quotedAt = isoFromUnix(row?.last_updated_at);
      if (!quotedAt) continue;
      quotes[internal] = { ...quotes[internal], quotedAt };
    }
  } catch (err) {
    console.error("[market-data] CoinGecko quote-time lookup failed:", err);
  }
}

/** Crypto is live without a key, but allow disabling via env if ever needed. */
export function isCryptoLiveConfigured(): boolean {
  return process.env.CRYPTO_DATA_DISABLED !== "1";
}

const CRYPTO_CACHE = new Map<string, LiveQuote>();
let cryptoStamp = 0;

/**
 * Crypto quotes in chain order: CoinGecko, then Kraken, Coinbase, and mapped
 * Yahoo. Swyftx is included only when SWYFTX_PUBLIC_DISPLAY is on. Returns a map
 * keyed by the ORIGINAL ticker (e.g. "BTC"). Returns {} on any error so callers
 * fall back to the last stored price.
 *
 * Crypto trades 24/7. This path does not consult NZX/ASX/US session hours,
 * does not label prints "at close", and does not freeze quotes after the cash
 * session ends. `bypassCache` is for the shared holdings snapshot, which has
 * its own shorter TTL.
 */
export function fetchCryptoQuotes(
  tickers: string[],
  opts?: { bypassCache?: boolean; ids?: Record<string, string>; strictCoinGecko?: string[] }
): Promise<Record<string, LiveQuote>> {
  if (!tickers.length || !isCryptoLiveConfigured()) return Promise.resolve({});
  const unique = Array.from(new Set(tickers.map((t) => t.toUpperCase()))).sort();
  const flightKey = `${opts?.bypassCache ? "b" : "c"}:${unique.join(",")}`;
  const pending = cryptoQuoteInflight.get(flightKey);
  if (pending) return pending;
  const work = loadCryptoQuotes(tickers, opts).finally(() => {
    if (cryptoQuoteInflight.get(flightKey) === work) cryptoQuoteInflight.delete(flightKey);
  });
  cryptoQuoteInflight.set(flightKey, work);
  return work;
}

async function loadCryptoQuotes(
  tickers: string[],
  opts?: { bypassCache?: boolean; ids?: Record<string, string>; strictCoinGecko?: string[] }
): Promise<Record<string, LiveQuote>> {
  if (!tickers.length || !isCryptoLiveConfigured()) return {};
  const unique = Array.from(new Set(tickers.map((t) => t.toUpperCase())));

  // Serve from cache when fresh. Always re-stamp as live so a cached equity-style
  // "close" flag can never leak into the crypto book.
  if (
    !opts?.bypassCache &&
    CRYPTO_CACHE.size &&
    Date.now() - cryptoStamp <= TTL_MS &&
    unique.every((t) => {
      const hit = CRYPTO_CACHE.get(t);
      return !!hit && publicSourceAllowed(hit.source);
    })
  ) {
    return Object.fromEntries(unique.map((t) => [t, stampCryptoQuoteLive(CRYPTO_CACHE.get(t)!)]));
  }

  const out: Record<string, LiveQuote> = {};
  const origin: Record<string, string> = {};

  // An explicit CoinGecko id that misses is left unpriced. Later feeds are not
  // asked to invent a print for that name.
  const strict = new Set((opts?.strictCoinGecko || []).map((t) => t.toUpperCase()));

  // 1) CoinGecko for every symbol.
  if (unique.length) {
    // idMap: coingecko id -> internal ticker
    const idMap = new Map<string, string>();
    unique.forEach((t) => {
      const id = opts?.ids?.[t] || coingeckoId(t);
      const existing = idMap.get(id);
      if (existing && existing !== t) return;
      idMap.set(id, t);
    });
    const ids = Array.from(idMap.keys()).join(",");
    try {
      const endpoint = coinGeckoEndpoint();
      const url = `${endpoint.base}/simple/price?ids=${encodeURIComponent(
        ids
      )}&vs_currencies=usd&include_24hr_change=true&include_last_updated_at=true`;
      const res = await fetch(url, { headers: endpoint.headers });
      if (res.ok) {
        const json = (await res.json()) as Record<
          string,
          { usd?: number; usd_24h_change?: number; last_updated_at?: number }
        >;
        for (const [id, q] of Object.entries(json)) {
          const internal = idMap.get(id);
          if (!internal || !q) continue;
          const price = Number(q.usd);
          const changePct = Number(q.usd_24h_change ?? 0);
          if (isFinite(price) && price > 0) {
            const quotedAt = isoFromUnix(q.last_updated_at);
            out[internal] = {
              price,
              changePct: isFinite(changePct) ? changePct : 0,
              ...(quotedAt ? { quotedAt } : {}),
            };
            origin[internal] = "coingecko";
          }
        }
        console.log(`[market-data] CoinGecko priced ${Object.keys(out).length}/${unique.length} coins`);
      } else {
        console.error(`[market-data] CoinGecko HTTP ${res.status} for [${ids}]`);
      }
    } catch (err) {
      console.error("[market-data] CoinGecko crypto fetch failed:", err);
    }
  }

  // 2) Shared chain for misses: Swyftx only when the display flag is on, then
  // Kraken, Coinbase, and Yahoo for mapped symbols.
  const missing = unique.filter((t) => !out[t] && !strict.has(t));
  if (missing.length) {
    try {
      const filled = await fillMissingPublicQuotes(missing);
      for (const [t, print] of Object.entries(filled)) {
        if (!print || !(print.price > 0) || !publicSourceAllowed(print.source)) continue;
        out[t] = {
          price: print.price,
          changePct: print.changePct ?? 0,
          ...(print.quotedAt ? { quotedAt: print.quotedAt } : {}),
          source: print.source,
        };
        origin[t] = print.source;
      }
    } catch (err) {
      console.error("[market-data] crypto chain fill failed:", err);
    }
  }

  await fillMissingCryptoQuoteTimes(out, opts?.ids);

  // Drop a print that fails the sanity check. Do not replace it with zero.
  const settled: Record<string, LiveQuote> = {};
  for (const [t, candidate] of Object.entries(out)) {
    if (!candidate || !(candidate.price > 0)) continue;
    const source = origin[t] || candidate.source || "coingecko";
    if (!publicSourceAllowed(source)) continue;
    const accepted = acceptCryptoPrint(
      t,
      {
        price: candidate.price,
        changePct: candidate.changePct,
        quotedAt: candidate.quotedAt,
        source,
      },
      [],
      source
    );
    if (!accepted || !(accepted.price > 0)) continue;
    settled[t] = stampCryptoQuoteLive({
      price: accepted.price,
      changePct: accepted.changePct ?? 0,
      ...(accepted.quotedAt ? { quotedAt: accepted.quotedAt } : {}),
      source: accepted.source,
      stale: false,
    });
  }
  if (Object.keys(settled).length) {
    Object.entries(settled).forEach(([t, v]) => CRYPTO_CACHE.set(t, v));
    cryptoStamp = Date.now();
  }
  return settled;
}

/* Shared 24/7 snapshot — holdings page, alerts, and /api/stocks/refresh. */

let cryptoSnap: { at: number; quotes: Record<string, LiveQuote> } | null = null;
let cryptoSnapInflight: Promise<{
  quotes: Record<string, LiveQuote>;
  updatedAt: string | null;
  live: boolean;
}> | null = null;
let cryptoSnapInflightKey = "";

/**
 * One cached crypto spot snapshot for every caller in this process. A fresh
 * snapshot that already covers the requested symbols is reused so the holdings
 * poll, alert evaluation, and the book refresh do not each hit the price feeds.
 * Quotes stay on the 24/7 path and are not labelled as a cash-session close.
 */
async function withSnapshotAsOf(stamped: { updatedAt: string | null; live: boolean }) {
  if (stamped.updatedAt) return stamped;
  try {
    const { readSharedCryptoBoard } = await import("@/lib/crypto-board-store");
    const board = await readSharedCryptoBoard({ seed: false });
    const at = board.at ? new Date(board.at) : null;
    if (at && !Number.isNaN(at.getTime())) {
      return { updatedAt: at.toISOString(), live: cryptoFreshnessLabel(at).live };
    }
  } catch {
    /* keep the null clock when the snapshot has no saved time */
  }
  return stamped;
}

function cryptoSnapshotStamp(quotes: Record<string, LiveQuote>, symbols: string[]) {
  const updated = latestQuoteTime(symbols.map((t) => quotes[t]?.quotedAt));
  const freshness = cryptoFreshnessLabel(updated);
  return {
    updatedAt: updated ? updated.toISOString() : null,
    live: freshness.live,
  };
}

export async function fetchCryptoLiveSnapshot(tickers: string[]): Promise<{
  quotes: Record<string, LiveQuote>;
  updatedAt: string | null;
  live: boolean;
}> {
  const unique = normalizeCryptoSymbols(tickers);
  if (!unique.length) {
    return { quotes: {}, updatedAt: null, live: false };
  }
  const key = unique.join(",");
  const fresh = cryptoSnap != null && Date.now() - cryptoSnap.at < CRYPTO_SNAPSHOT_TTL_MS;
  if (fresh && unique.every((t) => (cryptoSnap!.quotes[t]?.price ?? 0) > 0)) {
    const quotes = Object.fromEntries(unique.map((t) => [t, stampCryptoQuoteLive(cryptoSnap!.quotes[t])]));
    return { quotes, ...(await withSnapshotAsOf(cryptoSnapshotStamp(quotes, unique))) };
  }
  if (cryptoSnapInflight && cryptoSnapInflightKey === key) return cryptoSnapInflight;

  const job = (async () => {
    const raw = await fetchCryptoQuotes(unique, { bypassCache: true });
    const quotes: Record<string, LiveQuote> = { ...(cryptoSnap?.quotes ?? {}) };
    for (const [t, q] of Object.entries(raw)) {
      if (q && q.price > 0) quotes[t] = stampCryptoQuoteLive(q);
    }
    const at = Date.now();
    cryptoSnap = { at, quotes };
    const picked = Object.fromEntries(
      unique.filter((t) => (quotes[t]?.price ?? 0) > 0).map((t) => [t, stampCryptoQuoteLive(quotes[t])])
    );
    return { quotes: picked, ...(await withSnapshotAsOf(cryptoSnapshotStamp(picked, unique))) };
  })();

  cryptoSnapInflightKey = key;
  cryptoSnapInflight = job;
  try {
    return await job;
  } finally {
    if (cryptoSnapInflight === job) cryptoSnapInflight = null;
  }
}

/**
 * Unified quote fetch by asset class. Stocks use Yahoo Finance.
 * Crypto uses the public price chain. Both fall back to `{}`.
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

  // GOLD/SILVER are troy-ounce bullion. Yahoo's GOLD symbol is Gold.com, Inc.
  const equities = tickers
    .filter((t) => !isBullionHolding(t.asset_type, t.ticker) && (t.asset_type || "stock") !== "crypto")
    .map((t) => t.ticker.toUpperCase());
  const cryptos = tickers
    .filter((t) => !isBullionHolding(t.asset_type, t.ticker) && (t.asset_type || "stock") === "crypto")
    .map((t) => t.ticker.toUpperCase());
  for (const b of tickers) {
    if (!isBullionHolding(b.asset_type, b.ticker)) continue;
    out[b.ticker.toUpperCase()] = bullionDisplayName(b.ticker);
  }

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
