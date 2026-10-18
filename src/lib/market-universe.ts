import "server-only";

import { coinGeckoEndpoint } from "@/lib/coingecko-auth";

/**
 * Market-universe data layer for the one-time Free-Trial "Zenith Mode" engine.
 *
 * This is the WIDE-SCOPE provider that powers the Ultra Advanced trial report:
 *  - Crypto: the top-100 cryptocurrencies from CoinGecko (no API key) with
 *    24h / 7d / 30d performance, 12-month price history per coin, and crypto
 *    news from the same feeds as the market-news page (CryptoCompare, CoinDesk,
 *    Cointelegraph, and Yahoo Finance).
 *  - Stocks: the full NZX + ASX universe swept through the deterministic
 *    market-intel engine, overlaid with Yahoo Finance quotes. A paid 12-month
 *    chart feed is not called.
 *
 * SERVER-ONLY. Every network call is wrapped so a provider outage degrades
 * gracefully (falls back to the deterministic engine) and never throws up into
 * the report pipeline. All meaningful steps are logged for debugging.
 */

import {
  MARKET_UNIVERSE,
  analyzeSecurity,
  currencyForMarket,
  LIVE_COVERAGE_FLOOR,
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

function cgCall(path: string): { url: string; headers: Record<string, string> } {
  const endpoint = coinGeckoEndpoint();
  return { url: `${endpoint.base}${path}`, headers: endpoint.headers };
}

/**
 * The LIVE top-100 cryptocurrencies by market cap, with real multi-window
 * performance. This is the full data scope the Crypto trial report analyses.
 */
export async function fetchTopCryptos(limit = 100): Promise<CoinMarket[]> {
  return cached(`cg-top-${limit}`, TTL_MS, async () => {
    try {
      const call = cgCall(
        `/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${limit}` +
          `&page=1&sparkline=false&price_change_percentage=24h,7d,30d`
      );
      const res = await fetch(call.url, { headers: call.headers });
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
        change24h: Number(
          typeof r.price_change_percentage_24h === "number"
            ? r.price_change_percentage_24h
            : r.price_change_percentage_24h_in_currency ?? 0
        ),
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
      const call = cgCall(`/coins/${encodeURIComponent(coinId)}/market_chart?vs_currency=usd&days=365&interval=daily`);
      const res = await fetch(call.url, { headers: call.headers });
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

/**
 * Crypto news from the same feeds as loadMarketNews: CryptoCompare (no key),
 * CoinDesk, Cointelegraph, and the Yahoo Finance Bitcoin and Ethereum headlines.
 */
export async function fetchCryptoNews(limit = 12): Promise<NewsHeadline[]> {
  return cached(`crypto-news-${limit}`, TTL_MS * 2, async () => {
    try {
      const { loadMarketNews } = await import("@/lib/market-news");
      const live = await loadMarketNews("crypto");
      const items = live.slice(0, limit).map(
        (n) =>
          ({
            title: n.headline,
            source: n.source,
            url: n.url,
            publishedAt: new Date().toISOString(),
            snippet: n.summary.slice(0, 180),
            impact: n.impact,
          }) as NewsHeadline
      );
      console.log(`[market-universe] Fetched ${items.length} live crypto news items (RSS via market-news)`);
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

/* ==================== STOCKS (NZX / ASX / DOW / NASDAQ) ================= */

/**
 * The full stock universe swept by the ZENITH engine — the complete NZX + ASX
 * boards plus the Dow Jones 30 and Nasdaq-100 US constituents. This is the
 * "consider all stocks across ASX, NZX, DOW JONES and NASDAQ" scope.
 */
export const NZX_ASX_UNIVERSE = MARKET_UNIVERSE.filter(
  (e) => e.market === "NZX" || e.market === "ASX" || e.market === "US"
);

/**
 * Sweep the entire NZX + ASX + US (Dow/Nasdaq) universe. Yahoo Finance quotes
 * are overlaid where available; every name is then run through the
 * deterministic technical engine so the report always has a full-market
 * movers board + signals across all four exchanges.
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

  // SELF-CLEANING: a name with no live quote is left out. The directory seed
  // is not a price the paper form can lock, including when coverage is thin.
  const strict = liveCount >= Math.max(1, Math.floor(NZX_ASX_UNIVERSE.length * LIVE_COVERAGE_FLOOR));
  const activeUniverse = strict
    ? NZX_ASX_UNIVERSE.filter((e) => {
        const p = live[e.ticker.toUpperCase()]?.price;
        return typeof p === "number" && p > 0;
      })
    : NZX_ASX_UNIVERSE;

  const intel: SecurityIntel[] = activeUniverse.flatMap((e) => {
    const price = live[e.ticker.toUpperCase()]?.price;
    // A missing quote is omitted. The directory basePrice is not a fill.
    if (!(typeof price === "number" && price > 0)) return [];
    return [analyzeSecurity(e.ticker, price, e.name, e.market)];
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

/**
 * 12-month stock charts are not fetched. The paid chart call was only made
 * when a key was set, and this repo does not set that key.
 */
export async function fetchStockChart12mo(ticker: string): Promise<MonthPoint[]> {
  void ticker;
  return [];
}

export { currencyForMarket };
export type { MarketCode };
