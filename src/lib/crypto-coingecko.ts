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
  DEX_BACKOFF_MS,
  DEX_COLD_BUDGET_MS,
  DEX_STALE_MS,
  DEX_TRENDING,
  dexListNotice,
  dexSlotKey,
  dexTargets,
  freshDexRows,
  mergeDexLists,
  mergeDexPages,
  parseMegafilterPage,
  takeDexJobs,
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
const TOP400_MAX_AGE_MS = 5 * 60 * 1000;
const TOP400_COLD_MS = 3_000;
const TOP400_BACKOFF_MS = 60_000;
const TOP400_QUERY =
  "vs_currency=usd&order=market_cap_desc&per_page=250&sparkline=false" +
  "&price_change_percentage=1h,24h,7d";

let top400Entry: { at: number; value: RankedCryptoPage } | null = null;
let top400Inflight: Promise<RankedCryptoPage> | null = null;
let top400BackoffUntil = 0;

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

function note429(err: unknown) {
  const message = err instanceof Error ? err.message : String(err ?? "");
  if (/\b429\b/.test(message)) top400BackoffUntil = Date.now() + TOP400_BACKOFF_MS;
  return message.slice(0, 160);
}

/**
 * Page 1 is stored as soon as it arrives, then page 2 and the platform list.
 * A cold caller can return page 1 inside the 3s budget. Page 2 updates the same snapshot.
 * The public markets endpoint allows 250 rows per page, so two pages cover 400.
 */
async function refreshTop400(): Promise<RankedCryptoPage> {
  if (top400Inflight) return top400Inflight;
  top400Inflight = (async () => {
    const first = (await cgFetchRetry(`/coins/markets?${TOP400_QUERY}&page=1`)) as CgMarketRow[];
    if (!first?.length) throw new Error("Live crypto prices are unavailable.");
    top400Entry = { at: Date.now(), value: assembleTop400(first, null, true) };
    const [second, platforms] = await Promise.all([
      (cgFetchRetry(`/coins/markets?${TOP400_QUERY}&page=2`) as Promise<CgMarketRow[]>).catch((err) => {
        console.error("[crypto-coingecko] top 400 page 2 unavailable:", note429(err));
        return null;
      }),
      loadPlatforms(),
    ]);
    const page2 = Array.isArray(second) ? second : [];
    const page = assembleTop400([...first, ...page2], platforms, page2.length === 0);
    top400Entry = { at: Date.now(), value: page };
    const labelled = page.coins.filter((coin) => coin.blockchain).length;
    console.log(`[crypto-coingecko] fetchTop400 → ${page.coins.length} coins, blockchain ${labelled}/${page.coins.length}`);
    return page;
  })()
    .catch((err) => {
      console.error("[crypto-coingecko] top 400 refresh failed:", note429(err));
      throw err;
    })
    .finally(() => {
      top400Inflight = null;
    });
  return top400Inflight;
}

/** The latest CoinGecko snapshot, or null once it is older than the serve window. */
export function peekTop400(): RankedCryptoPage | null {
  if (!top400Entry) return null;
  if (Date.now() - top400Entry.at > TOP400_MAX_AGE_MS) return null;
  return top400Entry.value;
}

/**
 * CoinGecko top 400 by market cap (two pages of 250).
 * A fresh snapshot is returned immediately and refreshed in the background.
 * A cold call waits at most 3 seconds and returns the page that arrived.
 * A 429 backs off for 60 seconds. An expired snapshot is not served as padding.
 */
export async function fetchTop400(): Promise<RankedCryptoPage> {
  const now = Date.now();
  if (top400Entry && now - top400Entry.at < TOP400_FRESH_MS) return top400Entry.value;
  if (top400Entry && now < top400BackoffUntil && now - top400Entry.at < TOP400_MAX_AGE_MS) {
    return top400Entry.value;
  }
  if (top400Entry && now - top400Entry.at < TOP400_MAX_AGE_MS) {
    void refreshTop400().catch(() => {});
    return top400Entry.value;
  }
  const pending = refreshTop400();
  const raced = await Promise.race([pending.catch(() => null), sleep(TOP400_COLD_MS).then(() => null)]);
  if (raced && raced.coins.length) return raced;
  const peeked = peekTop400();
  if (peeked?.coins.length && top400Entry && now - top400Entry.at < TOP400_COLD_MS + 5_000) return peeked;
  if (raced) return raced;
  throw new Error("Live crypto prices are unavailable.");
}

export interface DexPage {
  rows: DexTokenRow[];
  notice: string | null;
  /** True when every network's first page is fresh and empty, so nothing more is coming. */
  sourceDown?: boolean;
}

/**
 * GeckoTerminal's public pool API. Each page holds 20 pools, so 400 tokens need
 * many pages. A cold tab fetches several networks at once and returns inside
 * DEX_COLD_BUDGET_MS. The merged list is kept in the same TTL cache as CoinGecko,
 * and a 429 does not replace it with a shorter list.
 */
const GT_BASE = "https://api.geckoterminal.com/api/v2";
const DEX_CACHE_KEY = "dex-merged";
const DEX_MEMORY_FRESH_MS = 15_000;
const DEX_CALL_TIMEOUT_MS = 2_200;

async function gtFetch(path: string, timeoutMs = DEX_CALL_TIMEOUT_MS): Promise<unknown> {
  const res = await fetch(`${GT_BASE}${path}`, {
    headers: { accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
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

/** Quote lookups read this. The merged list itself lives in the TTL cache. */
const dexPages: DexStoredPage[] = [];

interface DexMemory {
  pages: DexStoredPage[];
  rows: DexTokenRow[];
  at: number;
  rateLimited: boolean;
}

function readDexMemory(): DexMemory {
  const hit = store.get(DEX_CACHE_KEY) as CacheEntry<DexMemory> | undefined;
  return hit?.value ?? { pages: [], rows: [], at: 0, rateLimited: false };
}

function syncDexPages(pages: DexStoredPage[]) {
  dexPages.length = 0;
  dexPages.push(...pages);
}

function dexCatalogExhausted(pages: DexStoredPage[], now: number): boolean {
  const firsts = dexTargets().filter((target) => target.page === 1);
  return firsts.every((target) => {
    const slot = pages.find((page) => page.network === target.network && page.page === 1);
    return !!slot && now - slot.fetchedAt <= DEX_STALE_MS && slot.rows.length === 0;
  });
}

function dexRequestPath(network: string, page: number): string {
  const include = "include=base_token,quote_token,dex,network";
  if (network === DEX_TRENDING) return `/networks/trending_pools?${include}&page=${page}`;
  return `/networks/${network}/pools?${include}&sort=h24_volume_usd_desc&page=${page}`;
}

function snapshotDex(memory: DexMemory): DexPage {
  const rows = memory.rows.slice(0, 400);
  if (rows.length) {
    rememberCryptoIds(
      rows.flatMap((row) => (row.detailId ? [{ symbol: row.symbol, id: row.detailId }] : []))
    );
  }
  const stalled = memory.rateLimited && rows.length < 400;
  return {
    rows,
    notice: dexListNotice(rows.length, stalled),
    sourceDown: rows.length === 0 && dexCatalogExhausted(memory.pages, Date.now()) && !memory.rateLimited,
  };
}

type DexFetchResult =
  | { kind: "page"; page: DexStoredPage }
  | { kind: "rate"; network: string; page: number }
  | { kind: "miss"; network: string; page: number };

async function fetchDexPage(network: string, page: number, timeoutMs: number): Promise<DexFetchResult> {
  try {
    const payload = await gtFetch(dexRequestPath(network, page), timeoutMs);
    const rows = parseMegafilterPage(payload, network);
    return { kind: "page", page: { network, page, fetchedAt: Date.now(), rows } };
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    console.error(`[crypto-coingecko] DEX ${network} page ${page} unavailable:`, err);
    if (message.includes("429")) return { kind: "rate", network, page };
    if (message.includes("max number for page") || message.includes("GeckoTerminal 404")) {
      return { kind: "page", page: { network, page, fetchedAt: Date.now(), rows: [] } };
    }
    return { kind: "miss", network, page };
  }
}

/**
 * Several networks at once, stopping when the budget, 400 tokens, or a 429 is reached.
 * Pages already stored are kept. A 429 does not discard them.
 */
async function fillDexPages(seed: DexStoredPage[], budgetMs: number): Promise<{ pages: DexStoredPage[]; rateLimited: boolean }> {
  const started = Date.now();
  const pages = seed.map((page) => ({ ...page, rows: page.rows.slice() }));
  const blocked: Record<string, number> = {};
  let rateLimited = false;
  while (Date.now() - started < budgetMs) {
    if (freshDexRows(pages, Date.now()).length >= 400) break;
    const remaining = budgetMs - (Date.now() - started);
    if (remaining < 250) break;
    const jobs = takeDexJobs(pages, Date.now(), blocked);
    if (!jobs.length) break;
    const timeoutMs = Math.min(DEX_CALL_TIMEOUT_MS, remaining);
    const results = await Promise.all(jobs.map((job) => fetchDexPage(job.network, job.page, timeoutMs)));
    for (const result of results) {
      if (result.kind === "rate") {
        rateLimited = true;
        blocked[dexSlotKey(result.network, result.page)] = Date.now() + DEX_BACKOFF_MS;
        continue;
      }
      if (result.kind === "miss") {
        blocked[dexSlotKey(result.network, result.page)] = Date.now() + DEX_BACKOFF_MS;
        continue;
      }
      const key = dexSlotKey(result.page.network, result.page.page);
      const index = pages.findIndex((slot) => dexSlotKey(slot.network, slot.page) === key);
      if (index >= 0) pages[index] = result.page;
      else pages.push(result.page);
      console.log(
        `[crypto-coingecko] DEX ${result.page.network} p${result.page.page} → ${result.page.rows.length} pools, ${freshDexRows(pages, Date.now()).length} fresh tokens`
      );
    }
    if (rateLimited) break;
  }
  return { pages, rateLimited };
}

function commitDex(pages: DexStoredPage[], rateLimited: boolean): DexMemory {
  const previous = readDexMemory();
  const keptPages = mergeDexPages(previous.pages, pages);
  const incoming = freshDexRows(keptPages, Date.now());
  const rows = mergeDexLists(previous.rows, incoming, rateLimited);
  const value: DexMemory = { pages: keptPages, rows, at: Date.now(), rateLimited };
  store.set(DEX_CACHE_KEY, { at: value.at, value });
  syncDexPages(keptPages);
  return value;
}

let dexFill: Promise<DexMemory> | null = null;
let dexFollowUp: ReturnType<typeof setTimeout> | null = null;

function fillDexMemory(seed: DexStoredPage[]): Promise<DexMemory> {
  if (!dexFill) {
    dexFill = fillDexPages(seed, DEX_COLD_BUDGET_MS)
      .then(({ pages, rateLimited }) => commitDex(pages, rateLimited))
      .finally(() => {
        dexFill = null;
      });
  }
  return dexFill;
}

/** A warm process keeps asking for the next pages. A serverless freeze does not clear the cached list. */
function scheduleDexFollowUp(rateLimited: boolean, rowCount: number) {
  if (rowCount >= 400 || dexFollowUp) return;
  dexFollowUp = setTimeout(() => {
    dexFollowUp = null;
    const memory = readDexMemory();
    if (memory.rows.length >= 400) return;
    void fillDexMemory(memory.pages)
      .then((next) => scheduleDexFollowUp(next.rateLimited, next.rows.length))
      .catch((err) => console.error("[crypto-coingecko] DEX follow-up failed:", err));
  }, DEX_BACKOFF_MS);
}

/**
 * Up to 400 DEX tokens. A cold call waits at most DEX_COLD_BUDGET_MS and returns
 * what arrived. A list already cached is returned at once. A 429 never shrinks it.
 */
export async function fetchDexTop400(): Promise<DexPage> {
  const memory = readDexMemory();
  syncDexPages(memory.pages);
  const now = Date.now();
  if (memory.rows.length >= 400 && now - memory.at < DEX_STALE_MS) {
    return snapshotDex(memory);
  }
  if (memory.rows.length > 0 && now - memory.at < DEX_MEMORY_FRESH_MS) {
    void fillDexMemory(memory.pages).then((next) => scheduleDexFollowUp(next.rateLimited, next.rows.length));
    return snapshotDex(memory);
  }
  const filled = await Promise.race([
    fillDexMemory(memory.pages),
    sleep(3_000).then(() => null),
  ]);
  const latest = filled ?? readDexMemory();
  const page = snapshotDex(latest.rows.length ? latest : memory);
  scheduleDexFollowUp(latest.rateLimited, page.rows.length);
  return page;
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
