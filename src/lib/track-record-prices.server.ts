import "server-only";
import { fetchYahooCloseOn, yahooCryptoSymbol, yahooEquitySymbol } from "@/lib/yahoo-finance";
import { totalumSdk } from "@/lib/totalum";
import { laterPriceDay, type TrackCall } from "@/lib/track-record";

/**
 * Goal b20 G-20: later prices for hashed calls, from the existing Yahoo daily
 * close feed only. A close for a past day does not change, so once found it is
 * stored and reused:
 *  - Cloudflare Cache API (per data centre, one year) — always on;
 *  - Totalum table `track_record_price` — only when TRACK_RECORD_STORE=1, because
 *    the table needs creating first (fields: call_hash text, ticker text,
 *    price_day text YYYY-MM-DD, close number, source text). Off by default.
 * A day that has not closed yet, or a missing bar, stays null ("pending").
 */
const CACHE_BASE = "https://aetherforge.internal/track-later-v1/";
export const TRACK_STORE_ENABLED = () => process.env.TRACK_RECORD_STORE === "1";

function edgeCache(): Cache | null {
  const c = (globalThis as unknown as { caches?: { default?: Cache } }).caches;
  return c?.default ?? null;
}

async function cached(hash: string): Promise<number | null> {
  const cache = edgeCache();
  if (!cache) return null;
  try {
    const hit = await cache.match(CACHE_BASE + hash);
    if (!hit) return null;
    const v = Number(((await hit.json()) as { close?: number }).close);
    return v > 0 ? v : null;
  } catch {
    return null;
  }
}

async function stored(hash: string): Promise<number | null> {
  if (!TRACK_STORE_ENABLED()) return null;
  try {
    const res = await totalumSdk.crud.query("track_record_price", { _filter: { call_hash: hash }, _limit: 1 });
    const v = Number((res?.data as unknown as Array<{ close?: number }>)?.[0]?.close);
    return v > 0 ? v : null;
  } catch {
    return null;
  }
}

async function remember(call: TrackCall, day: string, close: number): Promise<void> {
  const cache = edgeCache();
  if (cache) {
    try {
      await cache.put(CACHE_BASE + call.hash, new Response(JSON.stringify({ close, day }), { headers: { "content-type": "application/json", "cache-control": "max-age=31536000" } }));
    } catch {
      /* best effort */
    }
  }
  if (TRACK_STORE_ENABLED()) {
    try {
      await totalumSdk.crud.createRecord("track_record_price", { call_hash: call.hash, ticker: call.ticker, price_day: day, close, source: "Yahoo Finance daily close" });
    } catch {
      /* table missing: cache still holds it */
    }
  }
}

export async function laterPricesFor(calls: readonly TrackCall[], now = Date.now()): Promise<{ prices: Record<string, number | null>; fetched: number; reused: number }> {
  const prices: Record<string, number | null> = {};
  let fetched = 0;
  let reused = 0;
  for (const call of calls) {
    const day = laterPriceDay(call, now);
    if (!day || call.direction === "neutral") {
      prices[call.hash] = null;
      continue;
    }
    const known = (await cached(call.hash)) ?? (await stored(call.hash));
    if (known != null) {
      prices[call.hash] = known;
      reused++;
      continue;
    }
    const symbol = call.bot === "koins" ? yahooCryptoSymbol(call.ticker) : yahooEquitySymbol(call.ticker);
    const close = await fetchYahooCloseOn(symbol, day);
    fetched++;
    prices[call.hash] = close != null && close > 0 ? close : null;
    if (close != null && close > 0) await remember(call, day, close);
  }
  return { prices, fetched, reused };
}
