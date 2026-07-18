/**
 * Server-only Swyftx data access for the Crypto Market feature.
 *
 * Swyftx (https://swyftx.com) is the user's Australian crypto exchange. This
 * module is a drop-in replacement for `crypto-coingecko.ts` — it exposes the
 * exact same shape (`fetchTop500` / `fetchCoinDetail` / `fetchCoinChart`) so the
 * whole Crypto Market surface keeps working unchanged, now priced off Swyftx.
 *
 * Endpoints used (all documented at https://docs.swyftx.com.au):
 *   POST /auth/refresh/                          — API key → short-lived access token
 *   GET  /markets/info/basic/                    — every asset: rank, marketCap (USD), volume (USD)
 *   GET  /live-rates/36/                         — live USD price + 24h change, keyed by asset id
 *   GET  /markets/info/detail/{CODE}/            — description, 7d/30d change, supply, links
 *   GET  /charts/getBars/USD/{CODE}/ask/         — OHLC candles for sparklines + detail charts
 *
 * The public market endpoints work keyless; when `SWYFTX_API_KEY` is set we
 * authenticate with the user's account (higher rate limits). Everything is
 * wrapped in a TTL cache with stale-on-error so a transient Swyftx hiccup never
 * blanks the UI.
 *
 * Do NOT import from client components — reached only through /api/crypto/*.
 */

import "server-only";
import { coinLogo, type CoinMarket, type CoinDetail, type CoinChart } from "@/lib/crypto-market";

const SX_BASE = "https://api.swyftx.com.au";
const USD_ID = 36; // Swyftx asset id for USD — /live-rates/36/ prices everything in USD
const FIAT_DENY = new Set(["AUD", "USD", "NZD", "EUR", "GBP"]);

/**
 * How many top-ranked coins get an enriched 7-day sparkline + 7d change.
 * Each needs one getBars sub-request, so we keep this comfortably under the
 * Cloudflare Worker per-request sub-request ceiling. Coins beyond this still
 * show full price / 24h / market-cap / volume data — just no inline sparkline.
 */
const SPARK_LIMIT = 40;
const SPARK_CONCURRENCY = 8;

/* ------------------------------ Access token ----------------------------- */

let tokenCache: { token: string; at: number } | null = null;
const TOKEN_TTL = 6 * 24 * 60 * 60 * 1000; // Swyftx access tokens last ~7 days

async function getAccessToken(): Promise<string | null> {
  const apiKey = process.env.SWYFTX_API_KEY;
  if (!apiKey) return null; // keyless public access still works
  if (tokenCache && Date.now() - tokenCache.at < TOKEN_TTL) return tokenCache.token;
  try {
    const res = await fetch(`${SX_BASE}/auth/refresh/`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ apiKey }),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`auth/refresh ${res.status}: ${(await res.text()).slice(0, 160)}`);
    const j = (await res.json()) as { accessToken?: string; access_token?: string };
    const token = j.accessToken || j.access_token;
    if (!token) throw new Error("auth/refresh returned no accessToken");
    tokenCache = { token, at: Date.now() };
    console.log("[crypto-swyftx] obtained Swyftx access token from API key");
    return token;
  } catch (err) {
    // Non-fatal: fall back to keyless public access so the dashboard still works.
    console.error("[crypto-swyftx] auth failed — continuing keyless:", err);
    return null;
  }
}

async function sxHeaders(): Promise<Record<string, string>> {
  const h: Record<string, string> = {
    accept: "application/json",
    "User-Agent": "TotalumCryptoDashboard/1.0",
  };
  const token = await getAccessToken();
  if (token) h["Authorization"] = `Bearer ${token}`;
  return h;
}

async function sxGet(path: string): Promise<any> {
  const res = await fetch(`${SX_BASE}${path}`, { headers: await sxHeaders(), cache: "no-store" });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Swyftx ${res.status} on ${path}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

/* ------------------------------- TTL cache ------------------------------- */

interface CacheEntry<T> {
  at: number;
  value: T;
}
const store = new Map<string, CacheEntry<any>>();

async function cached<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
  const hit = store.get(key) as CacheEntry<T> | undefined;
  const now = Date.now();
  if (hit && now - hit.at < ttlMs) return hit.value;
  try {
    const value = await loader();
    store.set(key, { at: now, value });
    return value;
  } catch (err) {
    if (hit) {
      console.error(`[crypto-swyftx] "${key}" load failed — serving stale cache:`, err);
      return hit.value;
    }
    throw err;
  }
}

/** Bounded-concurrency map for the per-coin sparkline fetches. */
async function pool<T>(items: T[], size: number, fn: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx]);
    }
  });
  await Promise.all(workers);
}

const num = (v: any): number | null => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && isFinite(n) ? n : null;
};

/* ------------------------------ Base fetchers ---------------------------- */

interface SxBasic {
  id: number;
  code: string;
  name: string;
  altName?: string;
  rank: number;
  buy: string;
  sell: string;
  volume24H: number;
  marketCap: number;
}
interface SxRate {
  midPrice: string;
  askPrice: string;
  bidPrice: string;
  dailyPriceChange: string | null;
}

/** All assets with rank / marketCap (USD) / volume (USD). Cached 60s. */
async function getBasic(): Promise<SxBasic[]> {
  return cached("basic", 60_000, async () => {
    const rows = (await sxGet("/markets/info/basic/")) as SxBasic[];
    return Array.isArray(rows) ? rows : [];
  });
}

/** Live USD price + 24h change keyed by numeric asset id. Cached 20s (frequent). */
async function getUsdRates(): Promise<Record<string, SxRate>> {
  return cached("rates:usd", 20_000, async () => {
    const map = (await sxGet(`/live-rates/${USD_ID}/`)) as Record<string, SxRate>;
    return map && typeof map === "object" ? map : {};
  });
}

/**
 * 7-day close series + 7d % change for the top-ranked coins, so the market
 * table can render real sparklines. Cached 10 min (sparklines don't need to be
 * as live as prices) and capped to SPARK_LIMIT sub-requests.
 */
async function getSparkMap(codes: string[]): Promise<Record<string, { series: number[]; change7d: number }>> {
  return cached("spark:top", 600_000, async () => {
    const now = Date.now();
    const start = now - 7 * 24 * 60 * 60 * 1000;
    const out: Record<string, { series: number[]; change7d: number }> = {};
    await pool(codes, SPARK_CONCURRENCY, async (code) => {
      try {
        const j = await sxGet(
          `/charts/getBars/USD/${encodeURIComponent(code)}/ask/?resolution=4h&timeStart=${start}&timeEnd=${now}`
        );
        const candles: any[] = j?.candles || [];
        const closes = candles.map((c) => Number(c.close)).filter((n) => isFinite(n));
        if (closes.length >= 2) {
          const change7d = ((closes[closes.length - 1] - closes[0]) / closes[0]) * 100;
          out[code] = { series: closes, change7d };
        }
      } catch (err) {
        // Per-coin failure is non-fatal — that coin just renders without a sparkline.
        console.error(`[crypto-swyftx] sparkline for ${code} failed:`, err);
      }
    });
    console.log(`[crypto-swyftx] enriched ${Object.keys(out).length}/${codes.length} coins with 7d sparklines`);
    return out;
  });
}

/* ------------------------------ Top-500 scan ----------------------------- */

export async function fetchTop500(): Promise<CoinMarket[]> {
  const [basic, rates] = await Promise.all([getBasic(), getUsdRates()]);

  // Keep tradable cryptos with a POSITIVE live USD price and a real rank; drop
  // fiat. Swyftx still lists delisted / rebranded assets (e.g. XMR, MATIC→POL,
  // RNDR→RENDER) in `basic` but prices them at 0 in live-rates — excluding those
  // ensures every coin the user can open a Buy on always shows a live price.
  const rows = basic
    .filter((b) => b && b.code && !FIAT_DENY.has(b.code.toUpperCase()) && b.rank > 0)
    .map((b) => ({ b, rate: rates[String(b.id)], mid: rates[String(b.id)] ? num(rates[String(b.id)].midPrice) : null }))
    .filter((x) => x.rate && x.mid != null && x.mid > 0)
    .sort((a, b) => a.b.rank - b.b.rank)
    .slice(0, 500);

  // Enrich the leaders with real 7-day sparklines.
  const topCodes = rows.slice(0, SPARK_LIMIT).map((x) => x.b.code.toUpperCase());
  const spark = await getSparkMap(topCodes);

  const coins: CoinMarket[] = rows.map(({ b, rate }) => {
    const code = b.code.toUpperCase();
    const s = spark[code];
    return {
      id: b.code.toLowerCase(),
      symbol: code,
      name: b.name || b.altName || code,
      image: coinLogo(code),
      rank: b.rank ?? 999999,
      price: num(rate.midPrice) ?? 0,
      marketCap: num(b.marketCap) ?? 0,
      fdv: null,
      volume24h: num(b.volume24H) ?? 0,
      change1h: null,
      change24h: num(rate.dailyPriceChange) ?? 0,
      change7d: s?.change7d ?? 0,
      high24h: null,
      low24h: null,
      circulatingSupply: null,
      totalSupply: null,
      maxSupply: null,
      ath: null,
      athDate: null,
      atl: null,
      atlDate: null,
      sparkline7d: s?.series ?? [],
    };
  });

  console.log(`[crypto-swyftx] fetchTop500 → ${coins.length} coins (from ${basic.length} Swyftx assets)`);
  return coins;
}

/* ---------------------------- Spot price lookup -------------------------- */

/**
 * Live USD spot price + 24h change for specific tickers (e.g. ["BTC","ETH"]).
 *
 * This is the PRIMARY source for the Buy/Sell price lock: Swyftx is the user's
 * own exchange and — authenticated with `SWYFTX_API_KEY` — never rate-limits us
 * the way keyless CoinGecko does, so a live crypto price always resolves. Keyed
 * by UPPERCASE ticker; any ticker Swyftx can't price is simply omitted so the
 * caller can fall back per-coin. Never throws.
 */
export async function fetchSpotPrices(
  tickers: string[]
): Promise<Record<string, { price: number; changePct: number }>> {
  const wanted = Array.from(new Set(tickers.map((t) => t.toUpperCase()))).filter(Boolean);
  const out: Record<string, { price: number; changePct: number }> = {};
  if (!wanted.length) return out;
  try {
    const [basic, rates] = await Promise.all([getBasic(), getUsdRates()]);
    const byCode = new Map<string, SxBasic>();
    for (const b of basic) if (b?.code) byCode.set(b.code.toUpperCase(), b);
    for (const code of wanted) {
      const b = byCode.get(code);
      if (!b) continue;
      const rate = rates[String(b.id)];
      const price = rate ? num(rate.midPrice) : null;
      if (price != null && price > 0) {
        out[code] = { price, changePct: num(rate.dailyPriceChange) ?? 0 };
      }
    }
    console.log(`[crypto-swyftx] fetchSpotPrices → ${Object.keys(out).length}/${wanted.length} priced`);
  } catch (err) {
    console.error("[crypto-swyftx] fetchSpotPrices failed:", err);
  }
  return out;
}

/* ------------------------------ Coin detail ------------------------------ */

function normalizeText(s: string | undefined | null): string {
  if (!s) return "";
  return s
    .replace(/<[^>]*>/g, "")
    .replace(/\r?\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

interface SxDetail {
  id: number;
  name: string;
  description?: string;
  category?: string;
  categories?: string[];
  rank?: number;
  volume?: { "24H"?: number };
  priceChange?: { week?: number; month?: number };
  urls?: { explorer?: string; reddit?: string; twitter?: string; website?: string };
  supply?: { circulating?: number; total?: number; max?: number };
}

export async function fetchCoinDetail(id: string): Promise<CoinDetail> {
  const code = id.toUpperCase();
  return cached(`detail:${code}`, 60_000, async () => {
    const [detailArr, rates, basic] = await Promise.all([
      sxGet(`/markets/info/detail/${encodeURIComponent(code)}/`),
      getUsdRates(),
      getBasic(),
    ]);
    const d: SxDetail | undefined = Array.isArray(detailArr) ? detailArr[0] : detailArr;
    if (!d) throw new Error(`Swyftx has no detail for ${code}`);

    const numId = d.id;
    const rate = rates[String(numId)];
    const b = basic.find((x) => x.id === numId || x.code?.toUpperCase() === code);

    return {
      id: code.toLowerCase(),
      symbol: code,
      name: d.name || b?.name || code,
      image: coinLogo(code),
      rank: d.rank ?? b?.rank ?? null,
      price: num(rate?.midPrice) ?? 0,
      marketCap: num(b?.marketCap),
      fdv: null,
      volume24h: num(d.volume?.["24H"]) ?? num(b?.volume24H),
      high24h: null,
      low24h: null,
      change1h: null,
      change24h: num(rate?.dailyPriceChange),
      change7d: num(d.priceChange?.week),
      change30d: num(d.priceChange?.month),
      change1y: null,
      circulatingSupply: num(d.supply?.circulating),
      totalSupply: num(d.supply?.total),
      maxSupply: num(d.supply?.max),
      ath: null,
      athDate: null,
      athChangePct: null,
      atl: null,
      atlDate: null,
      atlChangePct: null,
      description: normalizeText(d.description).slice(0, 1400),
      categories: (d.categories || []).filter(Boolean).slice(0, 6),
      homepage: d.urls?.website || null,
      explorer: d.urls?.explorer || null,
      twitter: d.urls?.twitter || null,
      reddit: d.urls?.reddit || null,
      github: null,
    };
  });
}

/* ------------------------------- Coin chart ------------------------------ */

/** Map the UI `days` param to a Swyftx resolution + look-back window. */
function mapDays(days: string, now: number): { resolution: string; start: number } {
  const DAY = 24 * 60 * 60 * 1000;
  switch (days) {
    case "1":
      return { resolution: "5m", start: now - 1 * DAY };
    case "7":
      return { resolution: "1h", start: now - 7 * DAY };
    case "30":
      return { resolution: "4h", start: now - 30 * DAY };
    case "90":
      return { resolution: "1d", start: now - 90 * DAY };
    case "365":
      return { resolution: "1d", start: now - 365 * DAY };
    case "max":
      return { resolution: "1w", start: now - 6 * 365 * DAY };
    default:
      return { resolution: "1h", start: now - 7 * DAY };
  }
}

export async function fetchCoinChart(id: string, days: string): Promise<CoinChart> {
  const code = id.toUpperCase();
  return cached(`chart:${code}:${days}`, 60_000, async () => {
    const now = Date.now();
    const { resolution, start } = mapDays(days, now);
    const j = await sxGet(
      `/charts/getBars/USD/${encodeURIComponent(code)}/ask/?resolution=${resolution}&timeStart=${start}&timeEnd=${now}`
    );
    const candles: any[] = j?.candles || [];
    const prices = candles
      .map((c) => ({ t: Number(c.time), price: Number(c.close) }))
      .filter((p) => isFinite(p.t) && isFinite(p.price));
    const volumes = candles
      .map((c) => ({ t: Number(c.time), price: Number(c.volume) }))
      .filter((p) => isFinite(p.t) && isFinite(p.price));
    return { prices, volumes };
  });
}
