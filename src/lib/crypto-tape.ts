/**
 * One crypto price and history read for /api/market?bot=crypto and /api/projections.
 * A row is published only when CoinGecko answered for the configured id.
 * A Yahoo or Google print on its own is a fallback and the row is hidden.
 *
 * Drops, each logged as `[crypto-sanity] TICKER: reason`:
 * 1. price, support, or low is not positive
 * 2. yesterday-to-today history move differs from the vendor 24h change by more than 10 percentage points
 * 3. a stablecoin moves more than 2% from 1.00 or day on day
 * 4. the whole history sits in a flat band
 * 5. a projection value sits on a clamp limit
 * Extra: live price and the last history close must stay within 3× of each other.
 */

import { coinGeckoEndpoint } from "@/lib/coingecko-auth";
import { coingeckoIdFor, normalizeCryptoTicker } from "@/lib/crypto-vendors";

export const CRYPTO_SANITY_RATIO = 3;

/**
 * Crypto ridge cap is `25 * 2.2` (the crypto vol scale). That product rounds to 55.
 * Confidence is clamped to 40..96, so 40 and 96 are clamp limits too.
 */
export const CRYPTO_EXPECTED_PCT_CLAMP = 55;
export const CONFIDENCE_CLAMP_LIMITS = [40, 96] as const;

/** At least these pegs. USDe is matched case-insensitively. */
export const STABLECOIN_TICKERS = ["USDT", "USDC", "DAI", "FDUSD", "TUSD", "USDE", "PYUSD"] as const;
const STABLECOINS = new Set<string>(STABLECOIN_TICKERS);

export interface CryptoAttempt {
  ticker: string;
  price: number;
  origin: "coingecko" | "fallback";
  history?: number[];
  support?: number;
  low?: number;
  /** Vendor 24h percent change, when the feed sent one. */
  change24h?: number;
  expectedPct?: number;
  confidence?: number;
}

export interface CryptoBoard {
  quotes: Record<string, number>;
  histories: Record<string, number[]>;
  change24h: Record<string, number>;
  hidden: { ticker: string; reason: string }[];
}

export type CryptoPrint = number | { price: number; change24h?: number };

/** Stablecoin codes keep their USD suffix. normalizeCryptoTicker("USDT") would wipe the name. */
export function boardTicker(ticker: string): string {
  const code = (ticker || "").toUpperCase().replace(/-USD$/, "").trim();
  if (STABLECOINS.has(code)) return code;
  return normalizeCryptoTicker(ticker) || code;
}

export function isStablecoinTicker(ticker: string): boolean {
  return STABLECOINS.has(boardTicker(ticker));
}

function finiteHistory(history: number[] | undefined): number[] {
  return (history || []).filter((n) => typeof n === "number" && Number.isFinite(n));
}

/** True when `value` is greater than `limit` by more than a rounding crumb. */
function exceeds(value: number, limit: number): boolean {
  return value - limit > 1e-9;
}

function dayMovePct(history: number[]): number | null {
  if (history.length < 2) return null;
  const yesterday = history[history.length - 2];
  const today = history[history.length - 1];
  if (!(yesterday > 0)) return null;
  return ((today - yesterday) / yesterday) * 100;
}

function atClampLimit(expectedPct?: number, confidence?: number): string | null {
  if (typeof expectedPct === "number" && Number.isFinite(expectedPct)) {
    if (Math.abs(Math.abs(expectedPct) - CRYPTO_EXPECTED_PCT_CLAMP) < 1e-6) {
      return `expectedPct ${expectedPct} is at a clamp limit`;
    }
  }
  if (typeof confidence === "number" && (CONFIDENCE_CLAMP_LIMITS as readonly number[]).includes(confidence)) {
    return `confidence ${confidence} is at a clamp limit`;
  }
  return null;
}

/** First failed brief rule, or the extra 3× check. Null when the row can be published. */
export function cryptoDropReason(row: {
  ticker: string;
  price: number;
  history?: number[];
  support?: number;
  low?: number;
  change24h?: number;
  expectedPct?: number;
  confidence?: number;
}): string | null {
  if (!(row.price > 0) || !Number.isFinite(row.price)) return "price is not positive";
  if (typeof row.support === "number" && (!(row.support > 0) || !Number.isFinite(row.support))) {
    return "support is not positive";
  }
  if (typeof row.low === "number" && (!(row.low > 0) || !Number.isFinite(row.low))) {
    return "low is not positive";
  }

  const history = finiteHistory(row.history);
  if (history.some((n) => n <= 0)) return "low is not positive";

  if (history.length >= 2) {
    const min = Math.min(...history);
    const max = Math.max(...history);
    if (min > 0 && max / min <= 1.0001) return "history sits in a flat band";
    if (min >= 0.005 && max <= 0.02) return "history sits in a placeholder band";
  }

  const move = dayMovePct(history);
  if (move != null && typeof row.change24h === "number" && Number.isFinite(row.change24h)) {
    if (exceeds(Math.abs(move - row.change24h), 10)) {
      return "history move differs from the vendor 24h change by more than 10 percentage points";
    }
  }

  if (isStablecoinTicker(row.ticker)) {
    if (exceeds(Math.abs(row.price - 1), 0.02)) return "stablecoin is more than 2% from 1.00";
    if (move != null && exceeds(Math.abs(move), 2)) return "stablecoin day move is more than 2%";
    if (typeof row.change24h === "number" && Number.isFinite(row.change24h) && exceeds(Math.abs(row.change24h), 2)) {
      return "stablecoin day move is more than 2%";
    }
  }

  if (history.length) {
    const last = history[history.length - 1];
    if (last > 0) {
      const ratio = row.price / last;
      if (ratio > CRYPTO_SANITY_RATIO || ratio < 1 / CRYPTO_SANITY_RATIO) {
        return `live price ${row.price} and history close ${last} do not agree`;
      }
    }
  }

  return atClampLimit(row.expectedPct, row.confidence);
}

export function dailyCloses(points: Array<[number, number]>): number[] {
  const byDay = new Map<string, number>();
  for (const [ms, price] of points) {
    if (!(price > 0) || !Number.isFinite(price) || !Number.isFinite(ms)) continue;
    const day = new Date(ms).toISOString().slice(0, 10);
    byDay.set(day, price);
  }
  return [...byDay.values()];
}

/** Keep a CoinGecko print that passes the sanity gate. Hide a fallback-only print. */
export function settleCryptoRows(rows: CryptoAttempt[]): CryptoBoard {
  const quotes: Record<string, number> = {};
  const histories: Record<string, number[]> = {};
  const change24h: Record<string, number> = {};
  const hidden: { ticker: string; reason: string }[] = [];

  for (const row of rows) {
    const ticker = boardTicker(row.ticker);
    if (row.origin === "fallback" && row.price > 0 && Number.isFinite(row.price)) {
      const reason = "only a fallback answered";
      hidden.push({ ticker, reason });
      console.warn(`[crypto-sanity] ${ticker}: ${reason}`);
      continue;
    }
    const reason = cryptoDropReason(row);
    if (reason) {
      hidden.push({ ticker, reason });
      console.warn(`[crypto-sanity] ${ticker}: ${reason}`);
      continue;
    }
    const history = finiteHistory(row.history).filter((n) => n > 0);
    quotes[ticker] = row.price;
    if (history.length) histories[ticker] = history;
    if (typeof row.change24h === "number" && Number.isFinite(row.change24h)) change24h[ticker] = row.change24h;
  }

  return { quotes, histories, change24h, hidden };
}

export interface CryptoTapeIo {
  coingeckoPrices(ids: { ticker: string; id: string }[]): Promise<Record<string, CryptoPrint>>;
  coingeckoHistory(id: string): Promise<number[]>;
  fallbackPrices(tickers: string[]): Promise<Record<string, CryptoPrint>>;
}

function readPrint(value: CryptoPrint | undefined): { price: number; change24h?: number } | null {
  if (typeof value === "number") {
    return value > 0 && Number.isFinite(value) ? { price: value } : null;
  }
  if (value && typeof value === "object") {
    const price = Number(value.price);
    if (!(price > 0) || !Number.isFinite(price)) return null;
    const change = value.change24h;
    return {
      price,
      change24h: typeof change === "number" && Number.isFinite(change) ? change : undefined,
    };
  }
  return null;
}

export async function loadCryptoBoard(tickers: string[], io: CryptoTapeIo): Promise<CryptoBoard> {
  const unique = Array.from(new Set(tickers.map(boardTicker).filter(Boolean)));
  const mapped = unique
    .map((ticker) => {
      const id = coingeckoIdFor(ticker);
      return id ? { ticker, id } : null;
    })
    .filter((row): row is { ticker: string; id: string } => !!row);

  let prices: Record<string, CryptoPrint> = {};
  try {
    prices = await io.coingeckoPrices(mapped);
  } catch (err) {
    console.error("[crypto-tape] CoinGecko prices failed:", err);
  }

  const missed = unique.filter((ticker) => !readPrint(prices[ticker]));
  let fallback: Record<string, CryptoPrint> = {};
  if (missed.length) {
    try {
      fallback = await io.fallbackPrices(missed);
    } catch (err) {
      console.error("[crypto-tape] Fallback prices failed:", err);
    }
  }

  const attempts: CryptoAttempt[] = [];
  for (const ticker of unique) {
    const print = readPrint(prices[ticker]);
    if (print) {
      const id = coingeckoIdFor(ticker);
      let history: number[] = [];
      if (id) {
        try {
          history = await io.coingeckoHistory(id);
        } catch (err) {
          console.error(`[crypto-tape] History failed for ${ticker}:`, err);
        }
      }
      attempts.push({
        ticker,
        price: print.price,
        change24h: print.change24h,
        origin: "coingecko",
        history,
      });
      continue;
    }
    const fb = readPrint(fallback[ticker]);
    if (fb) attempts.push({ ticker, price: fb.price, origin: "fallback" });
  }
  return settleCryptoRows(attempts);
}

const TTL_MS = 60_000;
let cache: { key: string; at: number; value: CryptoBoard } | null = null;

function cgCall(path: string): { url: string; headers: Record<string, string> } {
  const endpoint = coinGeckoEndpoint();
  return { url: `${endpoint.base}${path}`, headers: endpoint.headers };
}

async function liveCoingeckoPrices(ids: { ticker: string; id: string }[]): Promise<Record<string, CryptoPrint>> {
  if (!ids.length) return {};
  const tickersById = new Map<string, string[]>();
  for (const row of ids) {
    const list = tickersById.get(row.id) ?? [];
    list.push(row.ticker);
    tickersById.set(row.id, list);
  }
  const call = cgCall(`/simple/price?ids=${encodeURIComponent([...tickersById.keys()].join(","))}&vs_currencies=usd&include_24hr_change=true`);
  const res = await fetch(call.url, { headers: call.headers, cache: "no-store" });
  if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`);
  const json = (await res.json()) as Record<string, { usd?: number; usd_24h_change?: number }>;
  const out: Record<string, CryptoPrint> = {};
  for (const [id, quote] of Object.entries(json)) {
    const price = Number(quote?.usd);
    if (!(price > 0)) continue;
    const change = Number(quote?.usd_24h_change);
    const print: CryptoPrint = Number.isFinite(change) ? { price, change24h: change } : { price };
    for (const ticker of tickersById.get(id) ?? []) out[ticker] = print;
  }
  return out;
}

async function liveCoingeckoHistory(id: string): Promise<number[]> {
  const call = cgCall(`/coins/${encodeURIComponent(id)}/market_chart?vs_currency=usd&days=30`);
  const res = await fetch(call.url, { headers: call.headers, cache: "no-store" });
  if (!res.ok) throw new Error(`CoinGecko history HTTP ${res.status} for ${id}`);
  const json = (await res.json()) as { prices?: Array<[number, number]> };
  return dailyCloses(json.prices || []);
}

/** Cached live board. Both public crypto routes call this. No Yahoo or seed prices. */
export async function loadCryptoBoardLive(tickers: string[]): Promise<CryptoBoard> {
  const key = Array.from(new Set(tickers.map(boardTicker).filter(Boolean))).sort().join(",");
  if (cache && cache.key === key && Date.now() - cache.at < TTL_MS) return cache.value;
  const value = await loadCryptoBoard(tickers, {
    coingeckoPrices: liveCoingeckoPrices,
    coingeckoHistory: liveCoingeckoHistory,
    fallbackPrices: async () => ({}),
  });
  cache = { key, at: Date.now(), value };
  if (value.hidden.length) {
    console.warn(`[crypto-sanity] hid ${value.hidden.length} crypto row(s)`);
  }
  return value;
}

export interface PublishedCryptoRow {
  ticker: string;
  price: number;
  support?: number;
  projected7dPct?: number;
  confidence?: number;
}

/**
 * Second pass after the model has support and a projection.
 * Tape-level drops have already been logged. This pass logs clamp and level failures.
 */
export function filterPublishedCrypto<T extends PublishedCryptoRow>(
  rows: T[],
  context: { histories?: Record<string, number[]>; change24h?: Record<string, number> } = {}
): T[] {
  return rows.filter((row) => {
    const ticker = boardTicker(row.ticker);
    const history = context.histories?.[row.ticker] ?? context.histories?.[ticker];
    const reason = cryptoDropReason({
      ticker: row.ticker,
      price: row.price,
      history,
      support: row.support,
      low: history?.length ? Math.min(...history) : undefined,
      change24h: context.change24h?.[row.ticker] ?? context.change24h?.[ticker],
      expectedPct: row.projected7dPct,
      confidence: row.confidence,
    });
    if (!reason) return true;
    console.warn(`[crypto-sanity] ${ticker}: ${reason}`);
    return false;
  });
}

/**
 * Rows for /api/market?bot=crypto.
 * An empty board, a failed load, or an unfinished hand-check publishes nothing.
 * Directory seed prices are not a substitute.
 */
export function selectKoinsUniverse<T extends PublishedCryptoRow>(input: {
  paused: boolean;
  quotes: Record<string, number>;
  rows: T[];
  histories?: Record<string, number[]>;
  change24h?: Record<string, number>;
}): T[] {
  if (input.paused || Object.keys(input.quotes).length === 0) return [];
  return filterPublishedCrypto(input.rows, {
    histories: input.histories,
    change24h: input.change24h,
  }).filter((row) => {
    const ticker = boardTicker(row.ticker);
    return input.quotes[row.ticker] != null || input.quotes[ticker] != null;
  });
}
