/**
 * Daily closes from Twelve Data, the feed Lukas approved on 15 Nov 2026.
 * Same time_series call as src/lib/market-universe.ts fetchStockChart12mo, with a daily interval.
 * The key is MARKET_DATA_API_KEY. It is sent to Twelve Data and never written to a row or a log line.
 * Yahoo Finance is not called from here.
 */

import type { FeedBar } from "@/lib/daily-price-history";
import { historyStoreAllowed, type DailyMarket } from "@/lib/daily-price-sources";

export const TWELVE_DATA_SOURCE = "twelve-data";

export function marketDataApiKey(env: Record<string, string | undefined> = process.env): string | null {
  const key = String(env.MARKET_DATA_API_KEY || "").trim();
  return key || null;
}

/** True only when Twelve Data is the allowed history feed and the existing key is set. */
export function canReadTwelveData(env: Record<string, string | undefined> = process.env): boolean {
  return historyStoreAllowed(TWELVE_DATA_SOURCE) && !!marketDataApiKey(env);
}

/** Same suffix rules as the quote calls. A leading ^ is the index prefix already used on the snapshot symbols. */
export function twelveDailySymbol(symbol: string, market: DailyMarket): { symbol: string; country?: string } {
  const ticker = symbol.trim().toUpperCase();
  if (ticker.endsWith(".NZ")) return { symbol: ticker.replace(/\.NZ$/, ""), country: "New Zealand" };
  if (ticker.endsWith(".AX")) return { symbol: ticker.replace(/\.AX$/, ""), country: "Australia" };
  const bare = ticker.startsWith("^") ? ticker.slice(1) : ticker;
  if (market === "NZX") return { symbol: bare, country: "New Zealand" };
  if (market === "ASX") return { symbol: bare, country: "Australia" };
  return { symbol: bare };
}

export function twelveTimeSeriesUrl(input: { symbol: string; country?: string; outputsize: number; apiKey: string }): string {
  const params = new URLSearchParams({
    symbol: input.symbol,
    interval: "1day",
    outputsize: String(input.outputsize),
    apikey: input.apiKey,
    dp: "4",
    order: "ASC",
  });
  if (input.country) params.set("country", input.country);
  return `https://api.twelvedata.com/time_series?${params.toString()}`;
}

export function redactSecret(text: string, secret: string | null): string {
  const raw = String(text || "");
  const cleaned = secret ? raw.split(secret).join("[redacted]") : raw;
  return cleaned.slice(0, 120);
}

/**
 * Exact daily bars from a Twelve Data time_series body.
 * A missing close stays missing. Change is the difference between two closes the payload actually sent.
 */
export function barsFromTwelveValues(values: unknown, dates: readonly string[]): FeedBar[] {
  if (!Array.isArray(values)) return [];
  const want = new Set(dates);
  const parsed: { date: string; close: number }[] = [];
  for (const item of values) {
    if (!item || typeof item !== "object") continue;
    const datetime = String((item as { datetime?: unknown }).datetime || "");
    const date = datetime.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const close = Number((item as { close?: unknown }).close);
    if (!(close > 0) || !Number.isFinite(close)) continue;
    parsed.push({ date, close });
  }
  parsed.sort((a, b) => a.date.localeCompare(b.date));
  const out: FeedBar[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < parsed.length; i++) {
    const bar = parsed[i];
    if (!want.has(bar.date) || seen.has(bar.date)) continue;
    seen.add(bar.date);
    const prev = i > 0 ? parsed[i - 1] : null;
    const change = prev ? Number((bar.close - prev.close).toFixed(4)) : null;
    out.push({ date: bar.date, close: bar.close, change });
  }
  return out;
}

export interface TwelveFetchRequest {
  url: string;
  symbol: string;
  country?: string;
  apiKey: string;
}

export async function loadTwelveDailyBars(args: {
  symbol: string;
  market: DailyMarket;
  dates: readonly string[];
  env?: Record<string, string | undefined>;
  fetchImpl: (req: TwelveFetchRequest) => Promise<unknown>;
}): Promise<FeedBar[] | null> {
  const env = args.env ?? process.env;
  const apiKey = marketDataApiKey(env);
  if (!canReadTwelveData(env) || !apiKey) return null;
  const mapped = twelveDailySymbol(args.symbol, args.market);
  if (!mapped.symbol) return null;
  const outputsize = Math.min(60, Math.max(args.dates.length + 2, 8));
  const url = twelveTimeSeriesUrl({ ...mapped, outputsize, apiKey });
  let body: unknown;
  try {
    body = await args.fetchImpl({ url, symbol: mapped.symbol, country: mapped.country, apiKey });
  } catch (err) {
    const message = err instanceof Error ? err.message : "failed";
    console.error(`[daily-prices] Twelve Data read failed for ${args.symbol}: ${redactSecret(message, apiKey)}`);
    return null;
  }
  if (body == null) return null;
  const values = (body as { values?: unknown }).values;
  return barsFromTwelveValues(values, args.dates);
}
