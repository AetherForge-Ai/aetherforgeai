/**
 * Pure parser for on-chain pool and trending pages.
 * A missing price stays null. Nothing here invents a print.
 * The list is the pool or trending payload. It does not call a per-token price route.
 *
 * DexScreener pairs are the second list. GET /latest/dex/search is published
 * without a key at https://docs.dexscreener.com/api/reference. priceUsd is on
 * the pair, so that list does not call a per-token price route either.
 *
 * pull-check:crypto-dex-400-2026-10-11
 * pull-check:retest4-2026-10-11
 */

import { resolvableCoinId, type CoinMarket } from "@/lib/crypto-market";
import { CRYPTO_SANITY_RATIO } from "@/lib/crypto-tape";

export interface DexTokenRow {
  id: string;
  symbol: string;
  name: string;
  price: number | null;
  priceUnavailable: boolean;
  volume24h: number | null;
  network: string;
  dex: string;
  /** CoinGecko slug when the pool token carries one. Null when detail cannot be loaded. */
  detailId: string | null;
  /** GeckoTerminal base-token id (network plus address). Dedupe key when present. */
  address?: string;
  /** Pool reserve in USD. Missing means the row has not cleared a liquidity floor. */
  reserveUsd?: number | null;
}

interface IncludedToken {
  symbol: string;
  name: string;
  coinId: string;
  detailId: string | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function num(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
}

function includedDexNames(payload: Record<string, unknown>): Map<string, string> {
  const out = new Map<string, string>();
  const included = Array.isArray(payload.included) ? payload.included : [];
  for (const raw of included) {
    const row = asRecord(raw);
    if (!row || row.type !== "dex") continue;
    const id = String(row.id || "");
    const attrs = asRecord(row.attributes) || {};
    const name = String(attrs.name || "").trim();
    if (id && name) out.set(id, name);
  }
  return out;
}

function includedTokens(payload: Record<string, unknown>): Map<string, IncludedToken> {
  const out = new Map<string, IncludedToken>();
  const included = Array.isArray(payload.included) ? payload.included : [];
  for (const raw of included) {
    const row = asRecord(raw);
    if (!row || row.type !== "token") continue;
    const id = String(row.id || "");
    const attrs = asRecord(row.attributes) || {};
    const symbol = String(attrs.symbol || "").trim().toUpperCase();
    if (!id || !symbol) continue;
    const gecko = typeof attrs.coingecko_coin_id === "string" ? attrs.coingecko_coin_id : "";
    const detailId = resolvableCoinId(gecko);
    out.set(id, {
      symbol,
      name: String(attrs.name || symbol),
      coinId: detailId || id,
      detailId,
    });
  }
  return out;
}

function relId(pool: Record<string, unknown>, name: string): string {
  const rels = asRecord(pool.relationships);
  const rel = rels ? asRecord(rels[name]) : null;
  const data = rel ? asRecord(rel.data) : null;
  return data ? String(data.id || "") : "";
}

const NETWORK_LABEL: Record<string, string> = {
  eth: "Ethereum",
  ethereum: "Ethereum",
  solana: "Solana",
  bsc: "BNB Chain",
  "binance-smart-chain": "BNB Chain",
  base: "Base",
  arbitrum: "Arbitrum",
  polygon_pos: "Polygon",
  "polygon-pos": "Polygon",
  avax: "Avalanche",
  avalanche: "Avalanche",
  optimism: "Optimism",
  "optimistic-ethereum": "Optimism",
  ton: "TON",
  aptos: "Aptos",
  worldchain: "World Chain",
  "world-chain": "World Chain",
  robinhood: "Robinhood Chain",
};

/** Public pool network id → a readable chain name. An empty id stays Unavailable. */
export function dexNetworkLabel(id: string | null | undefined): string {
  const key = (id || "").trim().toLowerCase();
  if (!key) return "Unavailable";
  if (NETWORK_LABEL[key]) return NETWORK_LABEL[key];
  return key
    .split(/[_-]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/**
 * One pool page → base-token rows.
 * `fallbackNetwork` covers GeckoTerminal network pool pages, which omit the network relationship.
 * Duplicate pools in the page are kept; the caller dedupes.
 */
export function parseMegafilterPage(payload: unknown, fallbackNetwork = ""): DexTokenRow[] {
  const root = asRecord(payload);
  if (!root) return [];
  const tokens = includedTokens(root);
  const dexNames = includedDexNames(root);
  const data = Array.isArray(root.data) ? root.data : [];
  const rows: DexTokenRow[] = [];
  for (const raw of data) {
    const pool = asRecord(raw);
    if (!pool) continue;
    const attrs = asRecord(pool.attributes) || {};
    const token = tokens.get(relId(pool, "base_token"));
    const symbol = token?.symbol || "";
    if (!symbol) continue;
    const price = num(attrs.base_token_price_usd);
    const live = price != null && price > 0 ? price : null;
    const volume = num(asRecord(attrs.volume_usd)?.h24);
    const reserve = num(attrs.reserve_in_usd ?? attrs.reserve_usd);
    const dexId = relId(pool, "dex");
    const address = relId(pool, "base_token");
    rows.push({
      id: token?.coinId || address || symbol.toLowerCase(),
      symbol,
      name: token?.name || symbol,
      price: live,
      priceUnavailable: live == null,
      volume24h: volume != null && volume > 0 ? volume : null,
      network: dexNetworkLabel(relId(pool, "network") || fallbackNetwork),
      dex: dexNames.get(dexId) || dexId || "",
      detailId: token?.detailId ?? null,
      address,
      reserveUsd: reserve != null && reserve > 0 ? reserve : null,
    });
  }
  return rows;
}

/** USD price from the DEX list for this symbol. Null when that token has no print. */
export function dexPriceForSymbol(symbol: string, rows: DexTokenRow[]): number | null {
  const want = symbol.trim().toUpperCase();
  if (!want) return null;
  const hit = rows.find((row) => row.symbol.toUpperCase() === want && row.price != null && row.price > 0);
  return hit?.price ?? null;
}

function dexVolume(row: DexTokenRow): number {
  return row.volume24h != null && row.volume24h > 0 ? row.volume24h : 0;
}

function dexHasLivePrice(row: DexTokenRow): boolean {
  return !row.priceUnavailable && row.price != null && row.price > 0;
}

export function dexReserveUsd(row: DexTokenRow): number {
  return row.reserveUsd != null && row.reserveUsd > 0 ? row.reserveUsd : 0;
}

/** True when two positive prints stay within CRYPTO_SANITY_RATIO. */
export function dexPricesAgree(a: number, b: number, ratio = CRYPTO_SANITY_RATIO): boolean {
  if (!(a > 0) || !(b > 0) || !Number.isFinite(a) || !Number.isFinite(b)) return false;
  const span = a > b ? a / b : b / a;
  return span <= ratio;
}

/** Pool reserve, in USD, required before a token is listed. Dust pools are left out. */
export const DEX_LIQUIDITY_FLOOR_USD = 10_000;

/**
 * A published DEX row needs the price that came on the pool or pair.
 * A stated reserve under the floor is left out. A missing reserve is not a
 * failed per-token price call, so the row stays.
 */
export function dexRowClearsFloor(row: DexTokenRow, floor = DEX_LIQUIDITY_FLOOR_USD): boolean {
  if (!dexHasLivePrice(row)) return false;
  if (row.reserveUsd == null) return true;
  return dexReserveUsd(row) >= floor;
}

/**
 * DexScreener GET /latest/dex/search body. Pairs carry priceUsd.
 * https://docs.dexscreener.com/api/reference
 */
export function parseDexScreenerPairs(payload: unknown): DexTokenRow[] {
  const root = asRecord(payload);
  const pairs = Array.isArray(payload) ? payload : Array.isArray(root?.pairs) ? root.pairs : [];
  const rows: DexTokenRow[] = [];
  for (const raw of pairs) {
    const pair = asRecord(raw);
    if (!pair) continue;
    const base = asRecord(pair.baseToken);
    const symbol = String(base?.symbol || "").trim().toUpperCase();
    if (!symbol) continue;
    const price = num(pair.priceUsd);
    const live = price != null && price > 0 ? price : null;
    const volume = num(asRecord(pair.volume)?.h24);
    const reserve = num(asRecord(pair.liquidity)?.usd);
    const chain = String(pair.chainId || "").trim().toLowerCase();
    const address = String(base?.address || "").trim().toLowerCase();
    rows.push({
      id: address ? `${chain}_${address}` : symbol.toLowerCase(),
      symbol,
      name: String(base?.name || symbol),
      price: live,
      priceUnavailable: live == null,
      volume24h: volume != null && volume > 0 ? volume : null,
      network: dexNetworkLabel(chain),
      dex: String(pair.dexId || ""),
      detailId: null,
      address: address ? `${chain}_${address}` : "",
      reserveUsd: reserve != null && reserve > 0 ? reserve : null,
    });
  }
  return rows;
}

export type DexListKind = "pools" | "screener" | "snapshot" | "empty";

/**
 * Pool rows first, then DexScreener pairs, then the last saved list.
 * An empty result is only the last case. No price is filled in.
 */
export function resolveDexList(input: {
  poolRows: DexTokenRow[];
  screenerRows: DexTokenRow[];
  lastGood: DexTokenRow[];
}): { rows: DexTokenRow[]; kind: DexListKind } {
  const pools = dedupeDexTokens(
    (input.poolRows || []).filter((row) => dexRowClearsFloor(row)),
    DEX_TARGET_COUNT
  );
  if (pools.length) return { rows: pools, kind: "pools" };
  const screener = dedupeDexTokens(
    (input.screenerRows || []).filter((row) => dexRowClearsFloor(row)),
    DEX_TARGET_COUNT
  );
  if (screener.length) return { rows: screener, kind: "screener" };
  const saved = dedupeDexTokens(
    (input.lastGood || []).filter((row) => dexRowClearsFloor(row)),
    DEX_TARGET_COUNT
  );
  if (saved.length) return { rows: saved, kind: "snapshot" };
  return { rows: [], kind: "empty" };
}

/** Highest 24h volume wins. A live price beats a row with no print. A 3× price split keeps the deeper reserve. */
function preferDexRow(prev: DexTokenRow, next: DexTokenRow): DexTokenRow {
  const prevLive = dexHasLivePrice(prev);
  const nextLive = dexHasLivePrice(next);
  const disagree = prevLive && nextLive && !dexPricesAgree(prev.price as number, next.price as number);
  const chosen = disagree
    ? dexReserveUsd(next) > dexReserveUsd(prev)
      ? next
      : prev
    : prevLive !== nextLive
      ? nextLive
        ? next
        : prev
      : dexVolume(next) > dexVolume(prev)
        ? next
        : prev;
  const detailId = chosen.detailId || prev.detailId || next.detailId || null;
  const address = chosen.address || prev.address || next.address;
  if (detailId === chosen.detailId && address === chosen.address) return chosen;
  return { ...chosen, detailId, address };
}

/** Address when the pool named one. Otherwise the symbol, so an old row still collapses. */
function dexIdentity(row: DexTokenRow): string {
  const address = (row.address || "").trim().toLowerCase();
  if (address) return `addr:${address}`;
  return `symbol:${row.symbol.trim().toUpperCase()}`;
}

/**
 * One row per token address: the highest 24-hour volume, preferring a live price.
 * The same symbol on two chains stays as two rows. The list is ranked by volume and capped.
 */
export function dedupeDexTokens(rows: DexTokenRow[], limit = 400): DexTokenRow[] {
  const byIdentity = new Map<string, DexTokenRow>();
  for (const row of rows) {
    const key = dexIdentity(row);
    const prev = byIdentity.get(key);
    byIdentity.set(key, prev ? preferDexRow(prev, row) : row);
  }
  return [...byIdentity.values()]
    .sort((a, b) => {
      const av = dexVolume(a);
      const bv = dexVolume(b);
      if (av === 0 && bv === 0) return 0;
      if (av === 0) return 1;
      if (bv === 0) return -1;
      return bv - av;
    })
    .slice(0, limit);
}

export function dexRowToCoin(row: DexTokenRow, rank: number): CoinMarket {
  return {
    id: row.id || row.symbol.toLowerCase(),
    symbol: row.symbol.toUpperCase(),
    name: row.name || row.symbol,
    image: "",
    rank,
    price: row.price && row.price > 0 ? row.price : 0,
    marketCap: 0,
    fdv: null,
    volume24h: row.volume24h ?? 0,
    change1h: null,
    change24h: 0,
    change7d: 0,
    high24h: null,
    low24h: null,
    circulatingSupply: null,
    totalSupply: null,
    maxSupply: null,
    ath: null,
    athDate: null,
    atl: null,
    atlDate: null,
    sparkline7d: [],
    blockchain: row.network || "Unavailable",
    priceUnavailable: row.priceUnavailable || !(row.price != null && row.price > 0),
  };
}

/** A stored pool page is dropped once it is older than this. The price is not shown as live. */
export const DEX_STALE_MS = 30 * 60 * 1000;
export const DEX_TARGET_COUNT = 400;
export const DEX_FURTHER_NOTICE = "Further rows are still loading.";
export const DEX_EMPTY_NOTICE =
  "Showing 0 of up to 400. GeckoTerminal and DexScreener did not return a token list.";
/** GeckoTerminal returns 20 pools per page. The public API rejects page 11 and above. */
export const DEX_POOLS_PER_PAGE = 20;
export const DEX_PAGE_CAP = 10;
/** Global trending list. It is not a network id on `/networks/{id}/pools`. */
export const DEX_TRENDING = "trending";
/** Parallel page fetches on a cold tab. High enough to cover several networks, low enough to avoid a burst of 429s. */
export const DEX_FILL_CONCURRENCY = 5;
/** Cold DEX tab budget. The response returns whatever arrived inside this window. */
export const DEX_COLD_BUDGET_MS = 2_700;
/** Wait after a 429, a miss, or a follow-up batch. Stays under the public 30 calls a minute. */
export const DEX_BACKOFF_MS = 60_000;

/** Liquid public networks. Ids match GeckoTerminal `/networks`. */
export const DEX_NETWORKS = [
  "eth",
  "solana",
  "bsc",
  "base",
  "arbitrum",
  "polygon_pos",
  "avax",
  "optimism",
  "ton",
  "aptos",
  "sui-network",
  "scroll",
  "linea",
  "blast",
  "zksync",
  "mantle",
  "ronin",
  "sei-network",
  "pulsechain",
  "core",
] as const;

export interface DexStoredPage {
  network: string;
  page: number;
  fetchedAt: number;
  rows: DexTokenRow[];
}

export function dexSlotKey(network: string, page: number): string {
  return `${network}:${page}`;
}

export function dexTargets(pageCap = DEX_PAGE_CAP): { network: string; page: number }[] {
  const targets: { network: string; page: number }[] = [];
  for (let page = 1; page <= pageCap; page++) {
    targets.push({ network: DEX_TRENDING, page });
    for (const network of DEX_NETWORKS) targets.push({ network, page });
  }
  return targets;
}

export function isDexPageFresh(fetchedAt: number, now: number, staleMs = DEX_STALE_MS): boolean {
  return now - fetchedAt <= staleMs;
}

/** Fresh pages only, ranked by 24h volume. A stale page contributes nothing. */
export function freshDexRows(pages: DexStoredPage[], now: number, staleMs = DEX_STALE_MS): DexTokenRow[] {
  const byKey = new Map(pages.map((page) => [dexSlotKey(page.network, page.page), page]));
  const collected: DexTokenRow[] = [];
  for (const target of dexTargets()) {
    const slot = byKey.get(dexSlotKey(target.network, target.page));
    if (!slot || !isDexPageFresh(slot.fetchedAt, now, staleMs)) continue;
    collected.push(...slot.rows.filter((row) => dexRowClearsFloor(row)));
  }
  return dedupeDexTokens(collected, DEX_TARGET_COUNT);
}

/**
 * Honest DEX count. A full list has no notice.
 * `stalled` means the walk stopped (rate limit) rather than still filling.
 */
export function dexListNotice(rowCount: number, stalled = false, kind: DexListKind = "pools"): string | null {
  if (kind === "empty" || rowCount <= 0) return DEX_EMPTY_NOTICE;
  if (rowCount >= DEX_TARGET_COUNT && kind === "pools") return null;
  const lead = `Showing ${rowCount} of up to 400.`;
  if (kind === "snapshot") return `${lead} Last saved DEX list. A newer list is not in this response.`;
  if (kind === "screener") return `${lead} DexScreener list. GeckoTerminal did not return a token list.`;
  if (stalled) return `${lead} The rate limit stopped the list.`;
  if (rowCount >= DEX_TARGET_COUNT) return null;
  return `${lead} ${DEX_FURTHER_NOTICE}`;
}

/**
 * Next missing or stale page. Skips deeper pages when the previous page is fresh and empty.
 * Returns null once 400 fresh tokens are already collected, and skips keys blocked until later.
 */
export function nextDexTarget(
  pages: DexStoredPage[],
  now: number,
  blockedUntil: Record<string, number> = {},
  staleMs = DEX_STALE_MS
): { network: string; page: number } | null {
  if (freshDexRows(pages, now, staleMs).length >= DEX_TARGET_COUNT) return null;
  const byKey = new Map(pages.map((page) => [dexSlotKey(page.network, page.page), page]));
  for (const target of dexTargets()) {
    const key = dexSlotKey(target.network, target.page);
    if ((blockedUntil[key] ?? 0) > now) continue;
    if (target.page > 1) {
      const prev = byKey.get(dexSlotKey(target.network, target.page - 1));
      if (!prev || !isDexPageFresh(prev.fetchedAt, now, staleMs) || prev.rows.length === 0) continue;
    }
    const slot = byKey.get(key);
    if (!slot || !isDexPageFresh(slot.fetchedAt, now, staleMs)) return target;
  }
  return null;
}

/** Milliseconds to wait so a walk stays inside 30 calls a minute and does not bunch. */
export function dexCallWaitMs(
  callTimes: number[],
  now: number,
  limit = 30,
  windowMs = 60_000,
  minGapMs = 2_000
): number {
  const recent = callTimes.filter((t) => now - t < windowMs).sort((a, b) => a - b);
  if (recent.length >= limit) return Math.max(0, windowMs - (now - recent[0]));
  if (!recent.length) return 0;
  return Math.max(0, minGapMs - (now - recent[recent.length - 1]));
}

/** The next pages to fetch together. In-flight keys are blocked so a batch does not repeat one page. */
export function takeDexJobs(
  pages: DexStoredPage[],
  now: number,
  blockedUntil: Record<string, number> = {},
  limit = DEX_FILL_CONCURRENCY
): { network: string; page: number }[] {
  const blocked = { ...blockedUntil };
  const jobs: { network: string; page: number }[] = [];
  for (let i = 0; i < limit; i++) {
    const job = nextDexTarget(pages, now, blocked);
    if (!job) break;
    blocked[dexSlotKey(job.network, job.page)] = now + 60_000;
    jobs.push(job);
  }
  return jobs;
}

/** Keep every stored page. A newer fetch of the same slot replaces the older one. */
export function mergeDexPages(previous: DexStoredPage[], incoming: DexStoredPage[]): DexStoredPage[] {
  const byKey = new Map<string, DexStoredPage>();
  for (const page of previous) byKey.set(dexSlotKey(page.network, page.page), page);
  for (const page of incoming) {
    const key = dexSlotKey(page.network, page.page);
    const prior = byKey.get(key);
    if (!prior || page.fetchedAt >= prior.fetchedAt) byKey.set(key, page);
  }
  return [...byKey.values()];
}

/**
 * A 429 must not replace a longer list with a shorter one.
 * A clean fetch (no rate limit) may replace the list with what the feed returned.
 */
export function mergeDexLists(previous: DexTokenRow[], incoming: DexTokenRow[], rateLimited: boolean): DexTokenRow[] {
  const next = dedupeDexTokens(incoming, DEX_TARGET_COUNT);
  if (next.length === 0) return dedupeDexTokens(previous, DEX_TARGET_COUNT);
  if (!rateLimited || previous.length === 0) return next;
  const merged = dedupeDexTokens([...previous, ...incoming], DEX_TARGET_COUNT);
  return merged.length >= previous.length ? merged : dedupeDexTokens(previous, DEX_TARGET_COUNT);
}

/**
 * CDN holds the merged DEX list. A full list stays fresh longer.
 * A short list revalidates sooner so the next request can add pages.
 */
export function dexResponseCacheControl(rowCount: number): string {
  if (rowCount >= DEX_TARGET_COUNT) return "public, max-age=60, s-maxage=300, stale-while-revalidate=600";
  if (rowCount > 0) return "public, max-age=15, s-maxage=30, stale-while-revalidate=300";
  return "public, max-age=0, s-maxage=15, stale-while-revalidate=60";
}
