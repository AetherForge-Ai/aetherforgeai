import "server-only";

/**
 * Market-universe data layer for the one-time Free-Trial "Zenith Mode" engine.
 *
 * This is the WIDE-SCOPE provider that powers the Ultra Advanced trial report:
 *  - Crypto: the LIVE top-100 cryptocurrencies from CoinGecko (no API key) with
 *    real 24h / 7d / 30d performance, real 12-month price history per coin, and
 *    real worldwide crypto news from CryptoCompare.
 *  - Stocks: the full NZX + ASX universe swept through the deterministic
 *    market-intel engine, overlaid with LIVE Twelve Data quotes + real 12-month
 *    monthly price history for the user's selected tickers when a key is present.
 *
 * SERVER-ONLY. Every network call is wrapped so a provider outage degrades
 * gracefully (falls back to the deterministic engine) and never throws up into
 * the report pipeline. All meaningful steps are logged for debugging.
 */

import {
  MARKET_UNIVERSE,
  analyzeSecurity,
  currencyForMarket,
  type SecurityIntel,
  type MarketCode,
} from "@/lib/market-intel";
import { fetchLiveQuotes, isLiveDataConfigured } from "@/lib/market-data";
import type {
  MonthPoint,
  MoverEntry,
  NewsHeadline,
  CryptoMoverBoards,
  StockMoverBoards,
} from "@/lib/trial-types";

/* ------------------------------- Types ---------------------------------- */

export interface CoinMarket {
  id: string;
  symbol: string; // upper-case, e.g. "BTC"
  name: string;
  image: string;
  price: number;
  marketCap: number;
  rank: number;
  change24h: number; // %
  change7d: number; // %
  change30d: number; // %
}

/* ------------------------------ TTL cache ------------------------------- */

const TTL_MS = 90_000;
type Cached<T> = { at: number; value: T };
const memo = new Map<string, Cached<unknown>>();

async function cached<T>(key: string, ttl: number, loader: () => Promise<T>): Promise<T> {
  const hit = memo.get(key) as Cached<T> | undefined;
  if (hit && Date.now() - hit.at < ttl) return hit.value;
  const value = await loader();
  memo.set(key, { at: Date.now(), value });
  return value;
}

/* ---------------------------- Month labelling --------------------------- */

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function monthLabel(ts: number): string {
  const d = new Date(ts);
  return `${MONTH_ABBR[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`;
}

/** Down-sample an array of [timestamp, price] to 12 evenly-spaced monthly points. */
function toTwelveMonthPoints(series: [number, number][]): MonthPoint[] {
  if (!series.length) return [];
  const points: MonthPoint[] = [];
  const N = 12;
  for (let i = 0; i < N; i++) {
    const idx = Math.round((i / (N - 1)) * (series.length - 1));
    const [ts, price] = series[idx];
    points.push({ label: monthLabel(ts), value: round(price, price < 5 ? 4 : 2) });
  }
  return points;
}

function round(v: number, dp = 2): number {
  const f = Math.pow(10, dp);
  return Math.round(v * f) / f;
}

/* ============================ CRYPTO (CoinGecko) ========================= */

const CG_BASE = "https://api.coingecko.com/api/v3";

function cgHeaders(): Record<string, string> {
  const h: Record<string, string> = { Accept: "application/json" };
  if (process.env.COINGECKO_API_KEY) h["x-cg-demo-api-key"] = process.env.COINGECKO_API_KEY;
  return h;
}

/**
 * The LIVE top-100 cryptocurrencies by market cap, with real multi-window
 * performance. This is the full data scope the Crypto trial report analyses.
 */
export async function fetchTopCryptos(limit = 100): Promise<CoinMarket[]> {
  return cached(`cg-top-${limit}`, TTL_MS, async () => {
    try {
      const url =
        `${CG_BASE}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${limit}` +
        `&page=1&sparkline=false&price_change_percentage=24h,7d,30d`;
      const res = await fetch(url, { headers: cgHeaders() });
      if (!res.ok) {
        console.error(`[market-universe] CoinGecko markets HTTP ${res.status}`);
        return [];
      }
      const rows = (await res.json()) as any[];
      const coins: CoinMarket[] = rows.map((r, i) => ({
        id: String(r.id),
        symbol: String(r.symbol || "").toUpperCase(),
        name: String(r.name || r.symbol || ""),
        image: String(r.image || ""),
        price: Number(r.current_price) || 0,
        marketCap: Number(r.market_cap) || 0,
        rank: Number(r.market_cap_rank) || i + 1,
        change24h: Number(r.price_change_percentage_24h_in_currency ?? r.price_change_percentage_24h ?? 0),
        change7d: Number(r.price_change_percentage_7d_in_currency ?? 0),
        change30d: Number(r.price_change_percentage_30d_in_currency ?? 0),
      }));
      console.log(`[market-universe] Fetched ${coins.length} live top-cap cryptos from CoinGecko`);
      return coins;
    } catch (err) {
      console.error("[market-universe] fetchTopCryptos failed:", err);
      return [];
    }
  });
}

/** Real 12-month monthly price history for one coin (by CoinGecko id). */
export async function fetchCryptoChart12mo(coinId: string): Promise<MonthPoint[]> {
  return cached(`cg-chart-${coinId}`, TTL_MS * 4, async () => {
    try {
      const url = `${CG_BASE}/coins/${encodeURIComponent(coinId)}/market_chart?vs_currency=usd&days=365&interval=daily`;
      const res = await fetch(url, { headers: cgHeaders() });
      if (!res.ok) {
        console.error(`[market-universe] CoinGecko market_chart HTTP ${res.status} for ${coinId}`);
        return [];
      }
      const json = (await res.json()) as { prices?: [number, number][] };
      const points = toTwelveMonthPoints(json.prices || []);
      console.log(`[market-universe] 12mo chart for ${coinId}: ${points.length} monthly points`);
      return points;
    } catch (err) {
      console.error(`[market-universe] fetchCryptoChart12mo(${coinId}) failed:`, err);
      return [];
    }
  });
}

/* ------------------------------ Crypto news ----------------------------- */

const BULLISH_WORDS = /\b(surge|soar|rally|jump|gain|record|inflow|approv|adopt|bull|breakout|upgrade|partnership|integrat|all-time high|ath)\b/i;
const BEARISH_WORDS = /\b(crash|plunge|drop|fall|slump|hack|exploit|lawsuit|ban|selloff|sell-off|outflow|liquidat|bear|downgrade|fraud|warns?)\b/i;

function classifyImpact(text: string): NewsHeadline["impact"] {
  if (BEARISH_WORDS.test(text)) return "Bearish";
  if (BULLISH_WORDS.test(text)) return "Bullish";
  return "Neutral";
}

/** Real, worldwide crypto news from CryptoCompare (free, no key required). */
export async function fetchCryptoNews(limit = 12): Promise<NewsHeadline[]> {
  return cached(`cc-news-${limit}`, TTL_MS * 2, async () => {
    try {
      const url = "https://min-api.cryptocompare.com/data/v2/news/?lang=EN&sortOrder=latest";
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (!res.ok) {
        console.error(`[market-universe] CryptoCompare news HTTP ${res.status}`);
        return [];
      }
      const json = (await res.json()) as { Data?: any[] };
      const items = (json.Data || []).slice(0, limit).map((n) => {
        const title = String(n.title || "");
        const body = String(n.body || "");
        return {
          title,
          source: String(n.source_info?.name || n.source || "Crypto Wire"),
          url: String(n.url || n.guid || ""),
          publishedAt: n.published_on ? new Date(Number(n.published_on) * 1000).toISOString() : new Date().toISOString(),
          snippet: body.slice(0, 180),
          impact: classifyImpact(`${title} ${body}`),
        } as NewsHeadline;
      });
      console.log(`[market-universe] Fetched ${items.length} live crypto news items`);
      return items;
    } catch (err) {
      console.error("[market-universe] fetchCryptoNews failed:", err);
      return [];
    }
  });
}

/* -------------------- Crypto movers from the top-100 -------------------- */

function toMover(c: CoinMarket, window: "24h" | "7d" | "30d"): MoverEntry {
  const changePct = window === "24h" ? c.change24h : window === "7d" ? c.change7d : c.change30d;
  return { symbol: c.symbol, name: c.name, price: c.price, changePct: round(changePct, 2), image: c.image };
}

/** Build gainer/loser boards across all top-100 coins for each time window. */
export function buildCryptoMoverBoards(coins: CoinMarket[]): CryptoMoverBoards {
  const by = (w: "24h" | "7d" | "30d", dir: 1 | -1) =>
    [...coins]
      .map((c) => toMover(c, w))
      .sort((a, b) => (b.changePct - a.changePct) * dir)
      .slice(0, 10);
  return {
    gainers24h: by("24h", 1),
    losers24h: by("24h", -1),
    gainers7d: by("7d", 1),
    gainers30d: by("30d", 1),
  };
}

/* ============================ STOCKS (NZX / ASX) ======================== */

/** The NZX + ASX universe (drops the US names) — the trial's stock scope. */
export const NZX_ASX_UNIVERSE = MARKET_UNIVERSE.filter((e) => e.market === "NZX" || e.market === "ASX");

/**
 * Sweep the entire NZX + ASX universe. Live Twelve Data quotes are overlaid
 * where available; every name is then run through the deterministic technical
 * engine so the report always has a full-market movers board + signals.
 */
export async function fetchStockUniverse(): Promise<{ intel: SecurityIntel[]; boards: StockMoverBoards }> {
  const tickers = NZX_ASX_UNIVERSE.map((e) => e.ticker);

  let live: Record<string, { price: number; changePct: number }> = {};
  if (isLiveDataConfigured()) {
    try {
      live = await fetchLiveQuotes(tickers);
    } catch (err) {
      console.error("[market-universe] NZX/ASX live quote sweep failed (using deterministic):", err);
    }
  }
  const liveCount = Object.keys(live).length;

  const intel: SecurityIntel[] = NZX_ASX_UNIVERSE.map((e) => {
    const q = live[e.ticker.toUpperCase()];
    return analyzeSecurity(e.ticker, q?.price ?? e.basePrice, e.name, e.market);
  });

  const movers: MoverEntry[] = intel.map((s) => {
    const q = live[s.ticker.toUpperCase()];
    return {
      symbol: s.ticker,
      name: s.name,
      price: s.price,
      changePct: round(q?.changePct ?? s.change1d, 2),
    };
  });

  const sorted = [...movers].sort((a, b) => b.changePct - a.changePct);
  const boards: StockMoverBoards = {
    gainers: sorted.slice(0, 8),
    losers: sorted.slice(-8).reverse(),
    universeSize: intel.length,
    live: liveCount > 0,
  };
  console.log(
    `[market-universe] NZX/ASX sweep: ${intel.length} names (${liveCount} live quotes) · scope ${boards.universeSize}`
  );
  return { intel, boards };
}

/** Real 12-month monthly history for a single stock ticker via Twelve Data. */
export async function fetchStockChart12mo(ticker: string): Promise<MonthPoint[]> {
  const key = process.env.MARKET_DATA_API_KEY;
  if (!key) return [];
  return cached(`td-chart-${ticker}`, TTL_MS * 4, async () => {
    try {
      const t = ticker.toUpperCase();
      const sym = t.replace(/\.(NZ|AX)$/, "");
      const country = t.endsWith(".NZ") ? "New Zealand" : t.endsWith(".AX") ? "Australia" : "";
      const params = new URLSearchParams({
        symbol: sym,
        interval: "1month",
        outputsize: "13",
        apikey: key,
        dp: "4",
        order: "ASC",
      });
      if (country) params.set("country", country);
      const res = await fetch(`https://api.twelvedata.com/time_series?${params.toString()}`, {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) {
        console.error(`[market-universe] Twelve Data time_series HTTP ${res.status} for ${ticker}`);
        return [];
      }
      const json = (await res.json()) as { values?: { datetime: string; close: string }[]; status?: string };
      if (!json.values?.length) return [];
      const series: [number, number][] = json.values
        .map((v) => [new Date(v.datetime).getTime(), Number(v.close)] as [number, number])
        .filter(([, p]) => isFinite(p) && p > 0);
      const points = toTwelveMonthPoints(series);
      console.log(`[market-universe] 12mo stock chart for ${ticker}: ${points.length} points`);
      return points;
    } catch (err) {
      console.error(`[market-universe] fetchStockChart12mo(${ticker}) failed:`, err);
      return [];
    }
  });
}

export { currencyForMarket };
export type { MarketCode };
