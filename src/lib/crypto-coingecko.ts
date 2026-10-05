/**
 * Server-only CoinGecko data access for the Crypto Market feature.
 *
 * Do NOT import this from client components — it is reached only through the
 * /api/crypto/* routes. Provides:
 *   - fetchTop500()      — the full top-500 universe (2 pages merged + deduped)
 *   - fetchCoinDetail()  — rich single-coin metadata
 *   - fetchCoinChart()   — price/volume series for a range
 *
 * All calls go through a small TTL cache with stale-on-error fallback so a brief
 * CoinGecko rate-limit (HTTP 429) never blanks the UI.
 */

import "server-only";
import { blockchainLabel, resolveSevenDayChange, type CoinMarket, type CoinDetail, type CoinChart } from "@/lib/crypto-market";
import { rememberCryptoIds } from "@/lib/crypto-id-registry";
import { dedupeDexTokens, parseMegafilterPage, type DexTokenRow } from "@/lib/crypto-dex";

const CG_BASE = "https://api.coingecko.com/api/v3";

/** Optional demo API key lifts the keyless rate limit; header is a no-op if unset. */
function cgHeaders(): Record<string, string> {
  const h: Record<string, string> = { accept: "application/json" };
  const key = process.env.COINGECKO_API_KEY;
  if (key) h["x-cg-demo-api-key"] = key;
  return h;
}

/* ------------------------------- TTL cache ------------------------------- */

interface CacheEntry<T> {
  at: number;
  value: T;
}
const store = new Map<string, CacheEntry<any>>();

/**
 * Cache a loader by key. Returns fresh value within `ttlMs`. On loader failure,
 * returns the last cached value (however stale) rather than throwing — the UI
 * stays populated through transient rate limits.
 */
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
      console.error(`[crypto-coingecko] "${key}" load failed — serving stale cache:`, err);
      return hit.value;
    }
    throw err;
  }
}

async function cgFetch(path: string): Promise<any> {
  const res = await fetch(`${CG_BASE}${path}`, {
    headers: cgHeaders(),
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`CoinGecko ${res.status} on ${path}: ${body.slice(0, 200)}`);
  }
  const type = res.headers.get("content-type") || "";
  const text = await res.text();
  if (!type.includes("json") && !text.trim().startsWith("{") && !text.trim().startsWith("[")) {
    throw new Error(`CoinGecko returned a non-JSON body on ${path}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`CoinGecko returned a non-JSON body on ${path}`);
  }
}

/* ------------------------------ Top-500 scan ----------------------------- */

interface CgMarketRow {
  id: string;
  symbol: string;
  name: string;
  image: string;
  current_price: number;
  market_cap: number;
  market_cap_rank: number;
  fully_diluted_valuation: number | null;
  total_volume: number;
  high_24h: number | null;
  low_24h: number | null;
  price_change_percentage_1h_in_currency?: number | null;
  price_change_percentage_24h_in_currency?: number | null;
  price_change_percentage_7d_in_currency?: number | null;
  price_change_percentage_24h?: number | null;
  circulating_supply: number | null;
  total_supply: number | null;
  max_supply: number | null;
  ath: number | null;
  ath_date: string | null;
  atl: number | null;
  atl_date: string | null;
  sparkline_in_7d?: { price: number[] } | null;
}

function mapMarketRow(r: CgMarketRow): CoinMarket {
  return {
    id: r.id,
    symbol: (r.symbol || "").toUpperCase(),
    name: r.name,
    image: r.image,
    rank: r.market_cap_rank ?? 999999,
    price: r.current_price ?? 0,
    marketCap: r.market_cap ?? 0,
    fdv: r.fully_diluted_valuation ?? null,
    volume24h: r.total_volume ?? 0,
    change1h: r.price_change_percentage_1h_in_currency ?? null,
    change24h: r.price_change_percentage_24h_in_currency ?? r.price_change_percentage_24h ?? 0,
    change7d:
      resolveSevenDayChange(r.price_change_percentage_7d_in_currency, r.sparkline_in_7d?.price) ?? 0,
    high24h: r.high_24h ?? null,
    low24h: r.low_24h ?? null,
    circulatingSupply: r.circulating_supply ?? null,
    totalSupply: r.total_supply ?? null,
    maxSupply: r.max_supply ?? null,
    ath: r.ath ?? null,
    athDate: r.ath_date ?? null,
    atl: r.atl ?? null,
    atlDate: r.atl_date ?? null,
    sparkline7d: r.sparkline_in_7d?.price ?? [],
    priceUnavailable: !(typeof r.current_price === "number" && r.current_price > 0),
  };
}

/**
 * Fetch the full top-500 universe. Two 250-row pages are requested in parallel,
 * merged, DEDUPED by id, and sorted by market_cap_rank ascending.
 *
 * Cached ~50s to comfortably sit under CoinGecko's keyless rate limit while
 * feeling live (the client hook also revalidates ~60s).
 */
export async function fetchTop500(): Promise<CoinMarket[]> {
  return cached("top500", 50_000, async () => {
    const common =
      "vs_currency=usd&order=market_cap_desc&per_page=250&sparkline=true" +
      "&price_change_percentage=1h,24h,7d";
    const [p1, p2] = await Promise.all([
      cgFetch(`/coins/markets?${common}&page=1`) as Promise<CgMarketRow[]>,
      cgFetch(`/coins/markets?${common}&page=2`) as Promise<CgMarketRow[]>,
    ]);

    const byId = new Map<string, CoinMarket>();
    for (const row of [...(p1 || []), ...(p2 || [])]) {
      if (!row?.id || byId.has(row.id)) continue; // dedupe
      byId.set(row.id, mapMarketRow(row));
    }
    const coins = Array.from(byId.values()).sort((a, b) => a.rank - b.rank);
    console.log(`[crypto-coingecko] fetchTop500 → ${coins.length} coins (deduped from ${(p1?.length || 0) + (p2?.length || 0)})`);
    return coins;
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface RankedCryptoPage {
  coins: CoinMarket[];
  /** Set when CoinGecko stopped short of the requested list. */
  notice: string | null;
}

async function loadPlatforms(): Promise<Map<string, Record<string, string>> | null> {
  try {
    return await cached("platforms", 6 * 60 * 60 * 1000, async () => {
      const list = (await cgFetch("/coins/list?include_platform=true")) as Array<{
        id?: string;
        platforms?: Record<string, string>;
      }>;
      const map = new Map<string, Record<string, string>>();
      for (const row of list || []) {
        if (!row?.id) continue;
        map.set(row.id, row.platforms && typeof row.platforms === "object" ? row.platforms : {});
      }
      return map;
    });
  } catch (err) {
    console.error("[crypto-coingecko] platform list unavailable:", err);
    return null;
  }
}

/**
 * CoinGecko top 400 by market cap. Pages are sequential so a 429 stops the
 * list instead of inventing the missing rows.
 */
export async function fetchTop400(): Promise<RankedCryptoPage> {
  return cached("top400", 60_000, async () => {
    const common =
      "vs_currency=usd&order=market_cap_desc&per_page=250&sparkline=false" +
      "&price_change_percentage=1h,24h,7d";
    let notice: string | null = null;
    const pages: CgMarketRow[] = [];
    try {
      const first = (await cgFetch(`/coins/markets?${common}&page=1`)) as CgMarketRow[];
      pages.push(...(first || []));
    } catch (err) {
      console.error("[crypto-coingecko] top 400 page 1 failed:", err);
      throw new Error("Live crypto prices are unavailable.");
    }
    await sleep(1200);
    try {
      const second = (await cgFetch(`/coins/markets?${common}&page=2`)) as CgMarketRow[];
      pages.push(...(second || []));
    } catch (err) {
      console.error("[crypto-coingecko] top 400 page 2 unavailable:", err);
      notice = "Further rows are unavailable.";
    }
    const byId = new Map<string, CoinMarket>();
    for (const row of pages) {
      if (!row?.id || byId.has(row.id)) continue;
      byId.set(row.id, mapMarketRow(row));
    }
    let coins = Array.from(byId.values()).sort((a, b) => a.rank - b.rank).slice(0, 400);
    const platforms = await loadPlatforms();
    const listLoaded = platforms != null;
    coins = coins.map((coin) => ({
      ...coin,
      blockchain: blockchainLabel(platforms?.get(coin.id), listLoaded),
    }));
    if (coins.length < 400 && !notice) notice = "Further rows are unavailable.";
    rememberCryptoIds(coins.map((coin) => ({ symbol: coin.symbol, id: coin.id })));
    console.log(`[crypto-coingecko] fetchTop400 → ${coins.length} coins`);
    return { coins, notice };
  });
}

export interface DexPage {
  rows: DexTokenRow[];
  notice: string | null;
}

/**
 * GeckoTerminal's public pool API. CoinGecko's on-chain megafilter refuses
 * keyless calls (HTTP 401), which is why the DEX list was empty.
 * 30 calls/minute: pages are sequential with a gap, and a 429 stops the walk.
 */
const GT_BASE = "https://api.geckoterminal.com/api/v2";
const DEX_NETWORKS = ["eth", "solana", "bsc", "base", "arbitrum", "polygon_pos", "avax", "optimism", "ton", "aptos"];
const DEX_GAP_MS = 2_100;
const DEX_PAGE_CAP = 3;

async function gtFetch(path: string): Promise<unknown> {
  const res = await fetch(`${GT_BASE}${path}`, {
    headers: { accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`GeckoTerminal ${res.status} on ${path}: ${text.slice(0, 160)}`);
  }
  const type = res.headers.get("content-type") || "";
  if (!type.includes("json") && !text.trim().startsWith("{") && !text.trim().startsWith("[")) {
    throw new Error(`GeckoTerminal returned a non-JSON body on ${path}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`GeckoTerminal returned a non-JSON body on ${path}`);
  }
}

interface DexCache extends DexPage {
  budgetMs: number;
}

/**
 * Top decentralized tokens by 24-hour pool volume on the public GeckoTerminal API.
 * A fuller caller may refresh a short cached walk. A dead source keeps the last good list.
 * An empty cold load throws so the route says the list is unavailable instead of painting a blank table.
 */
export async function fetchDexTop400(opts?: { maxMs?: number }): Promise<DexPage> {
  const budget = opts?.maxMs && opts.maxMs > 0 ? opts.maxMs : 18_000;
  const hit = store.get("dex400") as CacheEntry<DexCache> | undefined;
  const fresh = !!hit && Date.now() - hit.at < 10 * 60_000 && hit.value.rows.length > 0;
  if (fresh && hit && (hit.value.rows.length >= 400 || hit.value.budgetMs >= budget)) {
    return hit.value;
  }
  try {
    const page = await walkDexPools(budget);
    const value: DexCache = { ...page, budgetMs: budget };
    store.set("dex400", { at: Date.now(), value });
    return value;
  } catch (err) {
    if (hit?.value.rows.length) {
      console.error("[crypto-coingecko] DEX load failed — serving the last good list:", err);
      return hit.value;
    }
    throw err;
  }
}

async function walkDexPools(budget: number): Promise<DexPage> {
  const started = Date.now();
  const collected: DexTokenRow[] = [];
  let notice: string | null = null;
  let calls = 0;
  const jobs: { network: string; page: number }[] = [];
  for (let page = 1; page <= DEX_PAGE_CAP; page++) {
    for (const network of DEX_NETWORKS) jobs.push({ network, page });
  }

  for (const job of jobs) {
    if (dedupeDexTokens(collected, 400).length >= 400) break;
    if (Date.now() - started > budget) {
      notice = "Further rows are unavailable.";
      break;
    }
    if (calls > 0) {
      if (Date.now() + DEX_GAP_MS - started > budget) {
        notice = "Further rows are unavailable.";
        break;
      }
      await sleep(DEX_GAP_MS);
    }
    calls += 1;
    try {
      const payload = await gtFetch(
        `/networks/${job.network}/pools?include=base_token,quote_token,dex&sort=h24_volume_usd_desc&page=${job.page}`
      );
      const rows = parseMegafilterPage(payload, job.network);
      if (rows.length) collected.push(...rows);
      } catch (err) {
        console.error(`[crypto-coingecko] DEX ${job.network} page ${job.page} unavailable:`, err);
        notice = "Further rows are unavailable.";
        const message = err instanceof Error ? err.message : "";
        // A 429 is account-wide, so further pages in this walk will fail too.
        if (message.includes("429")) break;
      }
  }

  const rows = dedupeDexTokens(collected, 400);
  if (!rows.length) throw new Error("Live decentralized-token prices are unavailable.");
  rememberCryptoIds(rows.map((row) => ({ symbol: row.symbol, id: row.id })));
  console.log(`[crypto-coingecko] fetchDexTop400 → ${rows.length} tokens`);
  return { rows, notice: rows.length >= 400 ? null : notice };
}

/* ------------------------------ Coin detail ------------------------------ */

function stripHtml(s: string | undefined | null): string {
  if (!s) return "";
  return s
    .replace(/<[^>]*>/g, "")
    .replace(/\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function fetchCoinDetail(id: string): Promise<CoinDetail> {
  return cached(`detail:${id}`, 60_000, async () => {
    const d = await cgFetch(
      `/coins/${encodeURIComponent(id)}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false`
    );
    const m = d.market_data || {};
    const num = (v: any): number | null => (typeof v === "number" && isFinite(v) ? v : null);
    const links = d.links || {};
    const repos: string[] = links.repos_url?.github ?? [];

    return {
      id: d.id,
      symbol: (d.symbol || "").toUpperCase(),
      name: d.name,
      image: d.image?.large || d.image?.small || d.image?.thumb || "",
      rank: num(d.market_cap_rank),
      price: num(m.current_price?.usd) ?? 0,
      marketCap: num(m.market_cap?.usd),
      fdv: num(m.fully_diluted_valuation?.usd),
      volume24h: num(m.total_volume?.usd),
      high24h: num(m.high_24h?.usd),
      low24h: num(m.low_24h?.usd),
      change1h: num(m.price_change_percentage_1h_in_currency?.usd),
      change24h: num(m.price_change_percentage_24h_in_currency?.usd) ?? num(m.price_change_percentage_24h),
      change7d: num(m.price_change_percentage_7d_in_currency?.usd),
      change30d: num(m.price_change_percentage_30d_in_currency?.usd),
      change1y: num(m.price_change_percentage_1y_in_currency?.usd),
      circulatingSupply: num(m.circulating_supply),
      totalSupply: num(m.total_supply),
      maxSupply: num(m.max_supply),
      ath: num(m.ath?.usd),
      athDate: m.ath_date?.usd ?? null,
      athChangePct: num(m.ath_change_percentage?.usd),
      atl: num(m.atl?.usd),
      atlDate: m.atl_date?.usd ?? null,
      atlChangePct: num(m.atl_change_percentage?.usd),
      description: stripHtml(d.description?.en).slice(0, 1200),
      categories: (d.categories || []).filter(Boolean).slice(0, 6),
      homepage: links.homepage?.find?.((u: string) => u) ?? null,
      explorer: links.blockchain_site?.find?.((u: string) => u) ?? null,
      twitter: links.twitter_screen_name ? `https://twitter.com/${links.twitter_screen_name}` : null,
      reddit: links.subreddit_url || null,
      github: repos.find((u) => u) ?? null,
    };
  });
}

/* ------------------------------- Coin chart ------------------------------ */

export async function fetchCoinChart(id: string, days: string): Promise<CoinChart> {
  return cached(`chart:${id}:${days}`, 60_000, async () => {
    const d = await cgFetch(
      `/coins/${encodeURIComponent(id)}/market_chart?vs_currency=usd&days=${encodeURIComponent(days)}`
    );
    const prices = (d.prices || []).map((p: [number, number]) => ({ t: p[0], price: p[1] }));
    const volumes = (d.total_volumes || []).map((p: [number, number]) => ({ t: p[0], price: p[1] }));
    return { prices, volumes };
  });
}
