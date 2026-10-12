/**
 * Shared crypto and DEX snapshot.
 *
 * Page reads return the persisted list and do not wait on CoinGecko or
 * GeckoTerminal. wrangler.jsonc has no cron trigger, so a stale read starts
 * one background refresh and POST /api/cron/crypto-snapshot runs the same
 * job when CRON_SECRET matches. A short isolate can freeze that background
 * work when the page response ends. The protected route is the run that
 * is allowed to finish.
 *
 * A new list replaces the stored one only when it is complete: at least 95%
 * of 400 rows, each with a name and a price (and a chain or DEX name).
 *
 * pull-check:v3-tier1a-2026-10-12
 */

import "server-only";

import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { coinGeckoEndpoint } from "@/lib/coingecko-auth";
import {
  MARKET_SNAPSHOT_TARGET,
  PLATFORM_DIRECTORY_TTL_MS,
  SNAPSHOT_STALE_MS,
  cleanDexRow,
  countLine,
  cryptoSnapshotComplete,
  dedupeDexByNetworkAddress,
  dexSnapshotComplete,
  displayCoinName,
  finiteMove,
  pricesAsAtLabel,
  snapshotBlockchain,
  snapshotIsStale,
  type CoinDirectoryEntry,
  type WindowMoves,
} from "@/lib/crypto-board";
import {
  DEX_NETWORKS,
  dexCallWaitMs,
  parseMegafilterPage,
  type DexTokenRow,
} from "@/lib/crypto-dex";
import { GECKOTERMINAL_ACCEPT } from "@/lib/crypto-coingecko";
import { coinDisplayName } from "@/lib/crypto-names";
import type { CoinMarket } from "@/lib/crypto-market";
import { persistCryptoSnapshot, persistDexSnapshot, readCryptoSnapshot, readDexSnapshot, snapshotWorthSaving } from "@/lib/crypto-snapshot";

const DIRECTORY_FILE = path.join(tmpdir(), "aetherforge-coin-directory.json");
const DIRECTORY_URL = "https://www.aetherforgeai.co.nz/__af/coin-directory";
const MARKETS_QUERY =
  "vs_currency=usd&order=market_cap_desc&per_page=250&sparkline=false&price_change_percentage=1h,24h,7d,30d";

export interface SharedCryptoBoard {
  coins: CoinMarket[];
  at: string | null;
  notice: string | null;
  delayed: boolean;
  countLine: string;
}

export interface SharedDexBoard {
  rows: DexTokenRow[];
  at: string | null;
  notice: string | null;
  delayed: boolean;
  countLine: string;
}

interface CacheGlobal {
  default?: {
    match(request: Request): Promise<Response | undefined>;
    put(request: Request, response: Response): Promise<void>;
  };
}

let directoryMemory: { at: number; entries: Map<string, CoinDirectoryEntry> } | null = null;
let refreshInflight: Promise<RefreshResult> | null = null;
let nextReaderAttemptAt = 0;

export interface RefreshResult {
  cryptoReplaced: boolean;
  dexReplaced: boolean;
  cryptoRows: number;
  dexRows: number;
  keptPrevious: boolean;
}

function cacheApi(): CacheGlobal["default"] | null {
  const caches = (globalThis as { caches?: CacheGlobal }).caches;
  return caches?.default ?? null;
}

function logStep(step: string, started: number, extra = ""): void {
  const ms = Date.now() - started;
  console.log(`[crypto-board] ${step} ${ms}ms${extra ? ` ${extra}` : ""}`);
}

async function cgJson(pathAndQuery: string): Promise<unknown> {
  const started = Date.now();
  let lastStatus = 0;
  for (let attempt = 0; attempt < 2; attempt++) {
    const endpoint = coinGeckoEndpoint(process.env, attempt === 1);
    const res = await fetch(`${endpoint.base}${pathAndQuery}`, {
      headers: endpoint.headers,
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    lastStatus = res.status;
    if (res.ok) {
      logStep("coingecko", started, `status=${res.status}`);
      return res.json();
    }
    if (res.status !== 401 && res.status !== 403) break;
  }
  throw new Error(`CoinGecko ${lastStatus || "failed"}`);
}

function mapMarkets(body: unknown, directory: Map<string, CoinDirectoryEntry> | null): CoinMarket[] {
  if (!Array.isArray(body)) return [];
  const coins: CoinMarket[] = [];
  for (const raw of body) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const id = String(row.id || "").trim().toLowerCase();
    const symbol = String(row.symbol || "").trim().toUpperCase();
    const price = finiteMove(row.current_price);
    if (!id || !symbol || price == null || !(price > 0)) continue;
    const listed = directory?.get(id);
    const moves: WindowMoves = {
      h24: finiteMove(row.price_change_percentage_24h),
      d7: finiteMove(row.price_change_percentage_7d_in_currency),
      d30: finiteMove(row.price_change_percentage_30d_in_currency),
    };
    const name = displayCoinName(symbol, typeof row.name === "string" ? row.name : "", listed?.name);
    const blockchain = snapshotBlockchain(
      id,
      listed?.platforms,
      typeof row.asset_platform_id === "string" ? row.asset_platform_id : null
    );
    coins.push({
      id,
      symbol,
      name,
      image: typeof row.image === "string" ? row.image : "",
      rank: finiteMove(row.market_cap_rank) ?? 999999,
      price,
      marketCap: finiteMove(row.market_cap) ?? 0,
      fdv: finiteMove(row.fully_diluted_valuation),
      volume24h: finiteMove(row.total_volume) ?? 0,
      change1h: finiteMove(row.price_change_percentage_1h_in_currency),
      change24h: moves.h24 ?? 0,
      change7d: moves.d7 ?? 0,
      high24h: finiteMove(row.high_24h),
      low24h: finiteMove(row.low_24h),
      circulatingSupply: finiteMove(row.circulating_supply),
      totalSupply: finiteMove(row.total_supply),
      maxSupply: finiteMove(row.max_supply),
      ath: null,
      athDate: null,
      atl: null,
      atlDate: null,
      sparkline7d: [],
      blockchain,
      quotedAt: typeof row.last_updated === "string" ? row.last_updated : null,
      source: "coingecko",
      priceUnavailable: false,
      moves,
    });
  }
  const seen = new Set<string>();
  return coins
    .sort((a, b) => a.rank - b.rank)
    .filter((coin) => {
      if (seen.has(coin.id)) return false;
      seen.add(coin.id);
      return true;
    })
    .slice(0, MARKET_SNAPSHOT_TARGET);
}

async function readDirectoryCache(): Promise<{ at: number; entries: Map<string, CoinDirectoryEntry> } | null> {
  if (directoryMemory && Date.now() - directoryMemory.at < PLATFORM_DIRECTORY_TTL_MS) return directoryMemory;
  let raw: string | null = null;
  try {
    const cache = cacheApi();
    const hit = cache ? await cache.match(new Request(DIRECTORY_URL)) : undefined;
    raw = hit ? await hit.text() : null;
  } catch {
    raw = null;
  }
  if (!raw) {
    try {
      raw = readFileSync(DIRECTORY_FILE, "utf8");
    } catch {
      raw = null;
    }
  }
  if (!raw) return directoryMemory;
  try {
    const parsed = JSON.parse(raw) as { at?: unknown; entries?: Record<string, CoinDirectoryEntry> };
    const at = typeof parsed.at === "number" ? parsed.at : Date.parse(String(parsed.at || ""));
    if (!Number.isFinite(at) || Date.now() - at > PLATFORM_DIRECTORY_TTL_MS) return null;
    const entries = new Map<string, CoinDirectoryEntry>();
    for (const [id, entry] of Object.entries(parsed.entries || {})) {
      if (!entry || typeof entry !== "object") continue;
      entries.set(id, {
        name: String(entry.name || ""),
        symbol: String(entry.symbol || ""),
        platforms: entry.platforms && typeof entry.platforms === "object" ? entry.platforms : {},
      });
    }
    directoryMemory = { at, entries };
    return directoryMemory;
  } catch {
    return null;
  }
}

async function writeDirectoryCache(entries: Map<string, CoinDirectoryEntry>): Promise<void> {
  const at = Date.now();
  directoryMemory = { at, entries };
  const body = JSON.stringify({
    at,
    entries: Object.fromEntries(entries),
  });
  try {
    writeFileSync(DIRECTORY_FILE, body);
  } catch (err) {
    console.error("[crypto-board] directory file was not saved:", err instanceof Error ? err.message.slice(0, 80) : "failed");
  }
  try {
    const cache = cacheApi();
    if (!cache) return;
    await cache.put(
      new Request(DIRECTORY_URL),
      new Response(body, { headers: { "content-type": "application/json", "cache-control": "public, max-age=86400" } })
    );
  } catch (err) {
    console.error("[crypto-board] directory cache was not saved:", err instanceof Error ? err.message.slice(0, 80) : "failed");
  }
}

async function loadDirectory(): Promise<Map<string, CoinDirectoryEntry> | null> {
  const cached = await readDirectoryCache();
  if (cached?.entries.size) return cached.entries;
  const started = Date.now();
  try {
    const body = await cgJson("/coins/list?include_platform=true");
    if (!Array.isArray(body)) return cached?.entries ?? null;
    const entries = new Map<string, CoinDirectoryEntry>();
    for (const raw of body) {
      if (!raw || typeof raw !== "object") continue;
      const row = raw as { id?: string; symbol?: string; name?: string; platforms?: Record<string, string> };
      if (!row.id) continue;
      entries.set(row.id, {
        name: String(row.name || ""),
        symbol: String(row.symbol || "").toUpperCase(),
        platforms: row.platforms && typeof row.platforms === "object" ? row.platforms : {},
      });
    }
    if (entries.size) await writeDirectoryCache(entries);
    logStep("coin-directory", started, `names=${entries.size}`);
    return entries.size ? entries : cached?.entries ?? null;
  } catch (err) {
    console.error("[crypto-board] coin directory failed:", err instanceof Error ? err.message.slice(0, 80) : "failed");
    return cached?.entries ?? null;
  }
}

async function gtJson(pathAndQuery: string): Promise<unknown> {
  const res = await fetch(`https://api.geckoterminal.com/api/v2${pathAndQuery}`, {
    headers: { accept: GECKOTERMINAL_ACCEPT },
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (res.status === 429) throw new Error("GeckoTerminal 429");
  if (!res.ok) throw new Error(`GeckoTerminal ${res.status}`);
  return res.json();
}

async function collectDexRows(): Promise<DexTokenRow[]> {
  const started = Date.now();
  const budgetMs = 20_000;
  const calls: number[] = [];
  const collected: DexTokenRow[] = [];
  const jobs: { network: string; path: string }[] = [
    { network: "trending", path: "/networks/trending_pools?include=base_token,quote_token,dex,network&page=1" },
  ];
  for (const network of DEX_NETWORKS) {
    jobs.push({
      network,
      path: `/networks/${network}/pools?include=base_token,quote_token,dex,network&sort=h24_volume_usd_desc&page=1`,
    });
    jobs.push({
      network,
      path: `/networks/${network}/trending_pools?include=base_token,quote_token,dex,network&page=1`,
    });
  }
  for (const job of jobs) {
    if (Date.now() - started > budgetMs) break;
    if (dedupeDexByNetworkAddress(collected).length >= MARKET_SNAPSHOT_TARGET) break;
    const wait = dexCallWaitMs(calls, Date.now());
    if (wait > 0 && Date.now() + wait - started > budgetMs) break;
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    calls.push(Date.now());
    try {
      const payload = await gtJson(job.path);
      const rows = parseMegafilterPage(payload, job.network === "trending" ? "" : job.network);
      collected.push(...rows);
    } catch (err) {
      const message = err instanceof Error ? err.message.slice(0, 80) : "failed";
      console.error(`[crypto-board] DEX ${job.network} skipped:`, message);
      if (message.includes("429")) break;
    }
  }
  const rows = dedupeDexByNetworkAddress(collected).filter((row) => cleanDexRow(row));
  logStep("dex-collect", started, `rows=${rows.length}`);
  return rows.map((row) => cleanDexRow(row) as DexTokenRow);
}

export async function refreshMarketSnapshots(): Promise<RefreshResult> {
  const started = Date.now();
  const result: RefreshResult = {
    cryptoReplaced: false,
    dexReplaced: false,
    cryptoRows: 0,
    dexRows: 0,
    keptPrevious: true,
  };
  const at = new Date().toISOString();
  try {
    const directory = await loadDirectory();
    const [first, second] = await Promise.all([
      cgJson(`/coins/markets?${MARKETS_QUERY}&page=1`).catch((err) => {
        console.error("[crypto-board] markets page 1 failed:", err instanceof Error ? err.message.slice(0, 80) : "failed");
        return null;
      }),
      cgJson(`/coins/markets?${MARKETS_QUERY}&page=2`).catch((err) => {
        console.error("[crypto-board] markets page 2 failed:", err instanceof Error ? err.message.slice(0, 80) : "failed");
        return null;
      }),
    ]);
    const coins = mapMarkets([...(Array.isArray(first) ? first : []), ...(Array.isArray(second) ? second : [])], directory);
    result.cryptoRows = coins.length;
    if (cryptoSnapshotComplete(coins) && snapshotWorthSaving(coins)) {
      await persistCryptoSnapshot(coins, at);
      result.cryptoReplaced = true;
      result.keptPrevious = false;
    } else {
      console.log(`[crypto-board] crypto list ${coins.length} is short of a complete snapshot; previous list kept`);
    }
  } catch (err) {
    console.error("[crypto-board] crypto refresh failed:", err instanceof Error ? err.message.slice(0, 80) : "failed");
  }
  try {
    const rows = await collectDexRows();
    result.dexRows = rows.length;
    if (dexSnapshotComplete(rows)) {
      await persistDexSnapshot(rows, at);
      result.dexReplaced = true;
      result.keptPrevious = result.keptPrevious && false;
    } else {
      console.log(`[crypto-board] DEX list ${rows.length} is short of a complete snapshot; previous list kept`);
    }
  } catch (err) {
    console.error("[crypto-board] DEX refresh failed:", err instanceof Error ? err.message.slice(0, 80) : "failed");
  }
  logStep("refresh", started, `crypto=${result.cryptoReplaced} dex=${result.dexReplaced}`);
  return result;
}

function kickRefresh(force: boolean): void {
  if (refreshInflight) return;
  if (!force && Date.now() < nextReaderAttemptAt) return;
  nextReaderAttemptAt = Date.now() + 60_000;
  refreshInflight = refreshMarketSnapshots()
    .then((result) => {
      if (result.cryptoReplaced || result.dexReplaced) nextReaderAttemptAt = Date.now() + 10 * 60 * 1000;
      return result;
    })
    .finally(() => {
      refreshInflight = null;
    });
  void refreshInflight.catch(() => undefined);
}

export function refreshMarketSnapshotsNow(): Promise<RefreshResult> {
  if (refreshInflight) return refreshInflight;
  nextReaderAttemptAt = Date.now() + 60_000;
  refreshInflight = refreshMarketSnapshots().finally(() => {
    refreshInflight = null;
  });
  return refreshInflight;
}

function presentCrypto(coins: CoinMarket[], at: string | null): SharedCryptoBoard {
  const notice = pricesAsAtLabel(at);
  return {
    coins,
    at,
    notice,
    delayed: snapshotIsStale(at, Date.now(), SNAPSHOT_STALE_MS),
    countLine: countLine("coins", coins.length),
  };
}

function presentDex(rows: DexTokenRow[], at: string | null): SharedDexBoard {
  const unique = dedupeDexByNetworkAddress(rows).map((row) => cleanDexRow(row)).filter((row): row is DexTokenRow => !!row);
  const notice = pricesAsAtLabel(at);
  return {
    rows: unique,
    at,
    notice,
    delayed: snapshotIsStale(at, Date.now(), SNAPSHOT_STALE_MS),
    countLine: countLine("DEX tokens", unique.length),
  };
}

export async function readSharedCryptoBoard(): Promise<SharedCryptoBoard> {
  const saved = await readCryptoSnapshot();
  if (!saved?.coins.length || snapshotIsStale(saved.at)) kickRefresh(false);
  if (!saved?.coins.length) kickRefresh(false);
  return presentCrypto(saved?.coins ?? [], saved?.at ?? null);
}

export async function readSharedDexBoard(): Promise<SharedDexBoard> {
  const saved = await readDexSnapshot();
  if (!saved?.rows.length || snapshotIsStale(saved.at)) kickRefresh(false);
  return presentDex(saved?.rows ?? [], saved?.at ?? null);
}

export interface SnapshotPrice {
  price: number;
  quotedAt: string | null;
  source: "snapshot" | "geckoterminal" | "recent";
  stale: boolean;
}

/** Price for Add, Sell, and the tape. Snapshot first. No key is logged. */
export async function priceFromSnapshot(input: {
  symbol?: string | null;
  coinId?: string | null;
  address?: string | null;
}): Promise<SnapshotPrice | null> {
  const symbol = (input.symbol || "").trim().toUpperCase();
  const coinId = (input.coinId || "").trim().toLowerCase();
  const address = (input.address || "").trim().toLowerCase();
  const [crypto, dex] = await Promise.all([readSharedCryptoBoard(), readSharedDexBoard()]);
  const coin = crypto.coins.find((row) => (coinId && row.id === coinId) || (symbol && row.symbol.toUpperCase() === symbol));
  if (coin && coin.price > 0) {
    return { price: coin.price, quotedAt: crypto.at, source: "snapshot", stale: crypto.delayed };
  }
  const dexRow = dex.rows.find((row) => {
    const rowAddress = (row.address || "").toLowerCase();
    if (address && rowAddress && (rowAddress === address || rowAddress.endsWith(address))) return true;
    if (coinId && (row.detailId === coinId || row.id === coinId)) return true;
    return symbol ? row.symbol.toUpperCase() === symbol : false;
  });
  if (dexRow?.price && dexRow.price > 0) {
    return { price: dexRow.price, quotedAt: dex.at, source: "snapshot", stale: dex.delayed };
  }
  return null;
}

export async function snapshotQuotesForSymbols(
  symbols: string[]
): Promise<Record<string, { price: number; changePct?: number; source: string; quotedAt: string | null }>> {
  const board = await readSharedCryptoBoard();
  const out: Record<string, { price: number; changePct?: number; source: string; quotedAt: string | null }> = {};
  for (const raw of symbols) {
    const symbol = raw.trim().toUpperCase();
    const coin = board.coins.find((row) => row.symbol.toUpperCase() === symbol);
    if (!coin || !(coin.price > 0)) continue;
    const change = coin.moves?.h24;
    out[symbol] = {
      price: coin.price,
      changePct: change == null ? undefined : change,
      source: "coingecko",
      quotedAt: coin.quotedAt || board.at,
    };
  }
  return out;
}

export function koinsFeedFailureFlag(): boolean {
  const raw = (process.env.KOINS_FEED_FAILURE || "").trim().toLowerCase();
  return raw === "1" || raw === "on" || raw === "true" || raw === "yes";
}

export async function koinsCandidatesFromSnapshot(): Promise<{
  at: string | null;
  candidates: import("@/lib/koins-quality").KoinsCandidate[];
}> {
  const board = await readSharedCryptoBoard();
  const candidates = board.coins
    .filter((coin) => coin.price > 0)
    .map((coin) => ({
      symbol: coin.symbol,
      name: coinDisplayName(coin.symbol, coin.name),
      price: coin.price,
      moves: coin.moves ?? { h24: null, d7: null, d30: null },
    }));
  return { at: board.at, candidates };
}

/** One GeckoTerminal token price. Used after the snapshot, never as the list. */
export async function liveDexTokenPrice(network: string, address: string): Promise<number | null> {
  const net = network.trim().toLowerCase();
  const addr = address.trim();
  if (!net || !addr) return null;
  try {
    const payload = await gtJson(`/networks/${encodeURIComponent(net)}/tokens/${encodeURIComponent(addr)}`);
    const data =
      payload && typeof payload === "object"
        ? (payload as { data?: { attributes?: { price_usd?: unknown } } }).data
        : null;
    const price = finiteMove(data?.attributes?.price_usd);
    return price != null && price > 0 ? price : null;
  } catch (err) {
    console.error("[crypto-board] token price failed:", err instanceof Error ? err.message.slice(0, 80) : "failed");
    return null;
  }
}
