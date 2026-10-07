/**
 * One crypto price and history read for /api/market?bot=crypto and /api/projections.
 * A row is published only when CoinGecko answered for the configured id.
 * A Yahoo or Google print on its own is a fallback and the row is hidden.
 * Live price and the last history close must stay within 3× of each other.
 */

import { coingeckoIdFor, normalizeCryptoTicker, yahooSymbolFor } from "@/lib/crypto-vendors";

export const CRYPTO_SANITY_RATIO = 3;

export interface CryptoAttempt {
  ticker: string;
  price: number;
  origin: "coingecko" | "fallback";
  history?: number[];
}

export interface CryptoBoard {
  quotes: Record<string, number>;
  histories: Record<string, number[]>;
  hidden: { ticker: string; reason: string }[];
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

/** Keep a CoinGecko print whose history agrees. Hide a fallback-only print. */
export function settleCryptoRows(rows: CryptoAttempt[]): CryptoBoard {
  const quotes: Record<string, number> = {};
  const histories: Record<string, number[]> = {};
  const hidden: { ticker: string; reason: string }[] = [];

  for (const row of rows) {
    const ticker = normalizeCryptoTicker(row.ticker);
    if (!(row.price > 0) || !Number.isFinite(row.price)) {
      hidden.push({ ticker, reason: "no price" });
      continue;
    }
    if (row.origin === "fallback") {
      const reason = "only a fallback answered";
      hidden.push({ ticker, reason });
      console.warn(`[crypto-sanity] ${ticker}: ${reason}`);
      continue;
    }
    const history = (row.history || []).filter((n) => typeof n === "number" && n > 0 && Number.isFinite(n));
    if (history.length) {
      const last = history[history.length - 1];
      const ratio = row.price / last;
      if (ratio > CRYPTO_SANITY_RATIO || ratio < 1 / CRYPTO_SANITY_RATIO) {
        const reason = `live price ${row.price} and history close ${last} do not agree`;
        hidden.push({ ticker, reason });
        console.warn(`[crypto-sanity] ${ticker}: ${reason}`);
        continue;
      }
    }
    quotes[ticker] = row.price;
    if (history.length) histories[ticker] = history;
  }

  return { quotes, histories, hidden };
}

export interface CryptoTapeIo {
  coingeckoPrices(ids: { ticker: string; id: string }[]): Promise<Record<string, number>>;
  coingeckoHistory(id: string): Promise<number[]>;
  fallbackPrices(tickers: string[]): Promise<Record<string, number>>;
}

export async function loadCryptoBoard(tickers: string[], io: CryptoTapeIo): Promise<CryptoBoard> {
  const unique = Array.from(new Set(tickers.map(normalizeCryptoTicker).filter(Boolean)));
  const mapped = unique
    .map((ticker) => {
      const id = coingeckoIdFor(ticker);
      return id ? { ticker, id } : null;
    })
    .filter((row): row is { ticker: string; id: string } => !!row);

  let prices: Record<string, number> = {};
  try {
    prices = await io.coingeckoPrices(mapped);
  } catch (err) {
    console.error("[crypto-tape] CoinGecko prices failed:", err);
  }

  const missed = unique.filter((ticker) => !(prices[ticker] > 0));
  let fallback: Record<string, number> = {};
  if (missed.length) {
    try {
      fallback = await io.fallbackPrices(missed);
    } catch (err) {
      console.error("[crypto-tape] Fallback prices failed:", err);
    }
  }

  const attempts: CryptoAttempt[] = [];
  for (const ticker of unique) {
    if (prices[ticker] > 0) {
      const id = coingeckoIdFor(ticker);
      let history: number[] = [];
      if (id) {
        try {
          history = await io.coingeckoHistory(id);
        } catch (err) {
          console.error(`[crypto-tape] History failed for ${ticker}:`, err);
        }
      }
      attempts.push({ ticker, price: prices[ticker], origin: "coingecko", history });
      continue;
    }
    if (fallback[ticker] > 0) {
      attempts.push({ ticker, price: fallback[ticker], origin: "fallback" });
    }
  }
  return settleCryptoRows(attempts);
}

const CG_BASE = "https://api.coingecko.com/api/v3";
const TTL_MS = 60_000;
let cache: { key: string; at: number; value: CryptoBoard } | null = null;

function cgHeaders(): Record<string, string> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (process.env.COINGECKO_API_KEY) headers["x-cg-demo-api-key"] = process.env.COINGECKO_API_KEY;
  return headers;
}

async function liveCoingeckoPrices(ids: { ticker: string; id: string }[]): Promise<Record<string, number>> {
  if (!ids.length) return {};
  const tickersById = new Map<string, string[]>();
  for (const row of ids) {
    const list = tickersById.get(row.id) ?? [];
    list.push(row.ticker);
    tickersById.set(row.id, list);
  }
  const url = `${CG_BASE}/simple/price?ids=${encodeURIComponent([...tickersById.keys()].join(","))}&vs_currencies=usd`;
  const res = await fetch(url, { headers: cgHeaders(), cache: "no-store" });
  if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`);
  const json = (await res.json()) as Record<string, { usd?: number }>;
  const out: Record<string, number> = {};
  for (const [id, quote] of Object.entries(json)) {
    const price = Number(quote?.usd);
    if (!(price > 0)) continue;
    for (const ticker of tickersById.get(id) ?? []) out[ticker] = price;
  }
  return out;
}

async function liveCoingeckoHistory(id: string): Promise<number[]> {
  const url = `${CG_BASE}/coins/${encodeURIComponent(id)}/market_chart?vs_currency=usd&days=30`;
  const res = await fetch(url, { headers: cgHeaders(), cache: "no-store" });
  if (!res.ok) throw new Error(`CoinGecko history HTTP ${res.status} for ${id}`);
  const json = (await res.json()) as { prices?: Array<[number, number]> };
  return dailyCloses(json.prices || []);
}

async function liveFallbackPrices(tickers: string[]): Promise<Record<string, number>> {
  const { fetchYahooCryptoLiveQuotes } = await import("@/lib/yahoo-finance");
  const map = Object.fromEntries(tickers.map((ticker) => [ticker, yahooSymbolFor(ticker).symbol]));
  const quotes = await fetchYahooCryptoLiveQuotes(map);
  const out: Record<string, number> = {};
  for (const [ticker, quote] of Object.entries(quotes)) {
    if (quote.price > 0) out[ticker] = quote.price;
  }
  return out;
}

/** Cached live board. Both public crypto routes call this. */
export async function loadCryptoBoardLive(tickers: string[]): Promise<CryptoBoard> {
  const key = Array.from(new Set(tickers.map(normalizeCryptoTicker))).sort().join(",");
  if (cache && cache.key === key && Date.now() - cache.at < TTL_MS) return cache.value;
  const value = await loadCryptoBoard(tickers, {
    coingeckoPrices: liveCoingeckoPrices,
    coingeckoHistory: liveCoingeckoHistory,
    fallbackPrices: liveFallbackPrices,
  });
  cache = { key, at: Date.now(), value };
  if (value.hidden.length) {
    console.warn(`[crypto-sanity] hid ${value.hidden.length} crypto row(s)`);
  }
  return value;
}
