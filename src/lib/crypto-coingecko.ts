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
import { assembleListedMarkets, coingeckoRolling24h, resolveSevenDayChange, type CoinMarket, type CoinDetail, type CoinChart } from "@/lib/crypto-market";
import { coinDisplayName } from "@/lib/crypto-names";
import { rememberCryptoIds } from "@/lib/crypto-id-registry";
import {
  DEX_NETWORKS,
  dexCallWaitMs,
  dexListNotice,
  dexSlotKey,
  freshDexRows,
  isDexPageFresh,
  nextDexTarget,
  parseMegafilterPage,
  type DexStoredPage,
  type DexTokenRow,
} from "@/lib/crypto-dex";

const CG_BASE = "https://api.coingecko.com/api/v3";

/** Optional demo API key lifts the keyless rate limit; header is a no-op if unset. */
function cgHeaders(keyless = false): Record<string, string> {
  const h: Record<string, string> = { accept: "application/json" };
  const key = process.env.COINGECKO_API_KEY;
  if (key && !keyless) h["x-cg-demo-api-key"] = key;
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

async function cgFetch(path: string, keyless = false): Promise<any> {
  const res = await fetch(`${CG_BASE}${path}`, {
    headers: cgHeaders(keyless),
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

/**
 * A demo key that is rejected or rate-limited (401/429) is retried once without the key.
 * Keyless public calls are what returned the full pages in a direct check.
 */
async function cgFetchRetry(path: string): Promise<any> {
  try {
    return await cgFetch(path, false);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (process.env.COINGECKO_API_KEY && /\b(401|429)\b/.test(message)) {
      console.error(`[crypto-coingecko] keyed call failed (${message.slice(0, 140)}). Retrying without the key.`);
      return cgFetch(path, true);
    }
    throw err;
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
  last_updated?: string | null;
}

function mapMarketRow(r: CgMarketRow): CoinMarket {
  return {
    id: r.id,
    symbol: (r.symbol || "").toUpperCase(),
    name: coinDisplayName(r.symbol, r.name),
    image: r.image,
    rank: r.market_cap_rank ?? 999999,
    price: r.current_price ?? 0,
    marketCap: r.market_cap ?? 0,
    fdv: r.fully_diluted_valuation ?? null,
    volume24h: r.total_volume ?? 0,
    change1h: r.price_change_percentage_1h_in_currency ?? null,
    change24h: coingeckoRolling24h(r) ?? 0,
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
    quotedAt: r.last_updated || null,
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
    const p1 = (await cgFetchRetry(`/coins/markets?${common}&page=1`)) as CgMarketRow[];
    const p2 = (await cgFetchRetry(`/coins/markets?${common}&page=2`).catch((err) => {
      console.error("[crypto-coingecko] top 500 page 2 unavailable:", err);
      return [] as CgMarketRow[];
    })) as CgMarketRow[];

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
      const list = (await cgFetchRetry("/coins/list?include_platform=true")) as Array<{
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

const TOP400_FRESH_MS = 60_000;
const TOP400_QUERY =
  "vs_currency=usd&order=market_cap_desc&per_page=250&sparkline=false" +
  "&price_change_percentage=1h,24h,7d";

let top400Entry: { at: number; value: RankedCryptoPage } | null = null;
let top400Inflight: Promise<RankedCryptoPage> | null = null;

function assembleTop400(
  pages: CgMarketRow[],
  platforms: Map<string, Record<string, string>> | null,
  page2Missing: boolean
): RankedCryptoPage {
  const mapped = pages.filter((row) => row?.id).map((row) => mapMarketRow(row));
  const page = assembleListedMarkets(mapped, platforms, page2Missing ? "page2" : platforms ? null : "short");
  rememberCryptoIds(page.coins.map((coin) => ({ symbol: coin.symbol, id: coin.id })));
  return page;
}

/**
 * Page 1 first, then page 2 and the platform list together.
 * A three-way burst is what a demo key answers with 429, after which the
 * backup list (about 89 names, no chain) takes over.
 */
async function loadTop400Pages(): Promise<{
  rows: CgMarketRow[];
  platforms: Map<string, Record<string, string>> | null;
  page2Missing: boolean;
}> {
  const first = (await cgFetchRetry(`/coins/markets?${TOP400_QUERY}&page=1`)) as CgMarketRow[];
  if (!first?.length) throw new Error("Live crypto prices are unavailable.");
  const [second, platforms] = await Promise.all([
    (cgFetchRetry(`/coins/markets?${TOP400_QUERY}&page=2`) as Promise<CgMarketRow[]>).catch((err) => {
      console.error("[crypto-coingecko] top 400 page 2 unavailable:", err);
      return null;
    }),
    loadPlatforms(),
  ]);
  const page2 = Array.isArray(second) ? second : [];
  return { rows: [...first, ...page2], platforms, page2Missing: page2.length === 0 };
}

async function refreshTop400(): Promise<RankedCryptoPage> {
  if (top400Inflight) return top400Inflight;
  top400Inflight = (async () => {
    const bundle = await loadTop400Pages();
    const page = assembleTop400(bundle.rows, bundle.platforms, bundle.page2Missing);
    top400Entry = { at: Date.now(), value: page };
    const labelled = page.coins.filter((coin) => coin.blockchain).length;
    console.log(`[crypto-coingecko] fetchTop400 → ${page.coins.length} coins, blockchain ${labelled}/${page.coins.length}`);
    return page;
  })().finally(() => {
    top400Inflight = null;
  });
  return top400Inflight;
}

/**
 * CoinGecko top 400 by market cap.
 * A fresh list is returned immediately. A stale list is returned while a
 * refresh runs, so the tab does not wait on CoinGecko again.
 */
export async function fetchTop400(): Promise<RankedCryptoPage> {
  const now = Date.now();
  if (top400Entry && now - top400Entry.at < TOP400_FRESH_MS) return top400Entry.value;
  if (top400Entry) {
    void refreshTop400().catch((err) => console.error("[crypto-coingecko] top 400 refresh failed:", err));
    return top400Entry.value;
  }
  return refreshTop400();
}

export interface DexPage {
  rows: DexTokenRow[];
  notice: string | null;
  /** True when every network's first page is fresh and empty, so nothing more is coming. */
  sourceDown?: boolean;
}

/**
 * GeckoTerminal's public pool API. CoinGecko's on-chain megafilter refuses
 * keyless calls (HTTP 401). Pages accumulate in this process. A request reads
 * the store and returns. One walk fills missing and stale pages at 30 calls a minute.
 */
const GT_BASE = "https://api.geckoterminal.com/api/v2";

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

const dexPages: DexStoredPage[] = [];
const dexCallTimes: number[] = [];
const dexBlockedUntil: Record<string, number> = {};
let dexWalk: Promise<void> | null = null;
let dexRateLimited = false;

function rememberDexPage(page: DexStoredPage) {
  const key = dexSlotKey(page.network, page.page);
  const index = dexPages.findIndex((slot) => dexSlotKey(slot.network, slot.page) === key);
  if (index >= 0) dexPages[index] = page;
  else dexPages.push(page);
}

function dexCatalogExhausted(now: number): boolean {
  return DEX_NETWORKS.every((network) => {
    const slot = dexPages.find((page) => page.network === network && page.page === 1);
    return !!slot && isDexPageFresh(slot.fetchedAt, now) && slot.rows.length === 0;
  });
}

function snapshotDex(): DexPage {
  const now = Date.now();
  const rows = freshDexRows(dexPages, now);
  if (rows.length) {
    rememberCryptoIds(
      rows.flatMap((row) => (row.detailId ? [{ symbol: row.symbol, id: row.detailId }] : []))
    );
  }
  const stillWalking = nextDexTarget(dexPages, now, dexBlockedUntil) != null && !dexRateLimited;
  return {
    rows,
    notice: dexListNotice(rows.length, !stillWalking && rows.length < 400),
    sourceDown: rows.length === 0 && dexCatalogExhausted(now) && !dexRateLimited,
  };
}

async function dexWalkLoop(): Promise<void> {
  try {
    while (true) {
      const now = Date.now();
      const job = nextDexTarget(dexPages, now, dexBlockedUntil);
      if (!job) {
        await sleep(5_000);
        continue;
      }
      const wait = dexCallWaitMs(dexCallTimes, Date.now());
      if (wait > 0) await sleep(wait);
      const key = dexSlotKey(job.network, job.page);
      dexCallTimes.push(Date.now());
      try {
        const payload = await gtFetch(
          `/networks/${job.network}/pools?include=base_token,quote_token,dex&sort=h24_volume_usd_desc&page=${job.page}`
        );
        const rows = parseMegafilterPage(payload, job.network);
        rememberDexPage({ network: job.network, page: job.page, fetchedAt: Date.now(), rows });
        delete dexBlockedUntil[key];
        const fresh = freshDexRows(dexPages, Date.now());
        console.log(`[crypto-coingecko] DEX ${job.network} p${job.page} → ${rows.length} pools, ${fresh.length} fresh tokens`);
      } catch (err) {
        const message = err instanceof Error ? err.message : "";
        console.error(`[crypto-coingecko] DEX ${job.network} page ${job.page} unavailable:`, err);
        if (message.includes("GeckoTerminal 404")) {
          rememberDexPage({ network: job.network, page: job.page, fetchedAt: Date.now(), rows: [] });
        } else         if (message.includes("429")) {
          dexRateLimited = true;
          await sleep(30_000);
          dexRateLimited = false;
        } else {
          dexBlockedUntil[key] = Date.now() + 2 * 60_000;
        }
      }
    }
  } finally {
    dexWalk = null;
  }
}

/** One walk per process. A second caller does not start another. */
function ensureDexWalk() {
  if (dexWalk) return;
  const walk = dexWalkLoop();
  dexWalk = walk;
  walk.catch((err) => {
    console.error("[crypto-coingecko] DEX walk stopped:", err);
    if (dexWalk === walk) dexWalk = null;
  });
}

/** Page 1 of the busiest networks, one call at a time. A parallel burst is what returns 429 and an empty tab. */
const DEX_PRIME_NETWORKS = ["eth", "solana", "bsc", "base", "arbitrum", "polygon_pos", "avax", "optimism"] as const;
const DEX_PRIME_DEADLINE_MS = 10_000;
const DEX_PRIME_MAX_CALLS = 8;

let dexPrime: Promise<void> | null = null;

async function fetchDexStoredPage(network: string, page: number): Promise<"ok" | "rate" | "miss" | "fresh"> {
  const key = dexSlotKey(network, page);
  const existing = dexPages.find((slot) => dexSlotKey(slot.network, slot.page) === key);
  if (existing && isDexPageFresh(existing.fetchedAt, Date.now())) return "fresh";
  dexCallTimes.push(Date.now());
  try {
    const payload = await gtFetch(
      `/networks/${network}/pools?include=base_token,quote_token,dex&sort=h24_volume_usd_desc&page=${page}`
    );
    const rows = parseMegafilterPage(payload, network);
    rememberDexPage({ network, page, fetchedAt: Date.now(), rows });
    delete dexBlockedUntil[key];
    return rows.length ? "ok" : "miss";
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    console.error(`[crypto-coingecko] DEX prime ${network} page ${page} unavailable:`, err);
    if (message.includes("GeckoTerminal 404")) {
      rememberDexPage({ network, page, fetchedAt: Date.now(), rows: [] });
      return "miss";
    }
    if (message.includes("429")) {
      dexRateLimited = true;
      return "rate";
    }
    dexBlockedUntil[key] = Date.now() + 2 * 60_000;
    return "miss";
  }
}

/**
 * A few sequential page-1 calls, stopping on the first 429.
 * The background walk continues toward 400 inside the 30-calls-a-minute gap.
 */
function primeDexList(): Promise<void> {
  if (freshDexRows(dexPages, Date.now()).length >= 400) return Promise.resolve();
  if (!dexPrime) {
    dexPrime = (async () => {
      const started = Date.now();
      let calls = 0;
      for (const network of DEX_PRIME_NETWORKS) {
        if (calls >= DEX_PRIME_MAX_CALLS) break;
        if (Date.now() - started > DEX_PRIME_DEADLINE_MS) break;
        if (freshDexRows(dexPages, Date.now()).length >= 400) break;
        const outcome = await fetchDexStoredPage(network, 1);
        if (outcome !== "fresh") calls += 1;
        if (outcome === "rate") break;
        if (calls < DEX_PRIME_NETWORKS.length) await sleep(250);
      }
      console.log(`[crypto-coingecko] DEX prime → ${freshDexRows(dexPages, Date.now()).length} tokens`);
    })().finally(() => {
      dexPrime = null;
    });
  }
  return Promise.race([dexPrime, sleep(DEX_PRIME_DEADLINE_MS).then(() => undefined)]);
}

/**
 * Fresh DEX rows, up to 400. A cold list waits only for the short prime.
 * A list already in memory is returned at once (stale-while-revalidate via the walk).
 */
export async function fetchDexTop400(): Promise<DexPage> {
  const fresh = freshDexRows(dexPages, Date.now());
  if (fresh.length >= 400) return snapshotDex();
  if (fresh.length === 0) await primeDexList();
  else void primeDexList();
  ensureDexWalk();
  return snapshotDex();
}

/**
 * Pools for one symbol. GeckoTerminal search is first; the stored top list fills gaps.
 * A failed call contributes nothing rather than a made-up price.
 */
export async function dexQuoteRows(symbol: string): Promise<DexTokenRow[]> {
  const want = symbol.trim();
  const collected: DexTokenRow[] = [];
  if (want) {
    try {
      const payload = await gtFetch(
        `/search/pools?query=${encodeURIComponent(want)}&include=base_token,quote_token,dex`
      );
      collected.push(...parseMegafilterPage(payload));
    } catch (err) {
      console.error(`[crypto-coingecko] DEX search for ${want} failed:`, err);
    }
  }
  // Already-fresh rows only. A quote must not start the top-400 walk.
  collected.push(...freshDexRows(dexPages, Date.now()));
  return collected;
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
      name: coinDisplayName(d.symbol, d.name),
      image: d.image?.large || d.image?.small || d.image?.thumb || "",
      rank: num(d.market_cap_rank),
      price: num(m.current_price?.usd) ?? 0,
      marketCap: num(m.market_cap?.usd),
      fdv: num(m.fully_diluted_valuation?.usd),
      volume24h: num(m.total_volume?.usd),
      high24h: num(m.high_24h?.usd),
      low24h: num(m.low_24h?.usd),
      change1h: num(m.price_change_percentage_1h_in_currency?.usd),
      change24h: coingeckoRolling24h({
        price_change_percentage_24h: num(m.price_change_percentage_24h),
        price_change_percentage_24h_in_currency: m.price_change_percentage_24h_in_currency,
      }),
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
