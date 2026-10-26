import { flushCryptoAttempt } from "@/lib/crypto-attempts";
/**
 * Shared crypto and DEX snapshot.
 *
 * Page reads return the persisted list. wrangler.jsonc has no cron trigger.
 * A stored list is served as saved and is never seeded on the read.
 * A completely empty crypto snapshot may seed once, and that wait is at most
 * 7 seconds. A stale list starts one background refresh. A short isolate
 * can still freeze that background work. POST /api/cron/crypto-snapshot
 * runs the same job when CRON_SECRET matches.
 *
 * A shorter seed does not replace a longer stored list. A crypto list with
 * at least 100 market-cap rows may replace it. A shorter DEX list replaces
 * a longer one only when the new list is complete.
 *
 * pull-check:v3-tier1a-2026-10-12
 * pull-check:v3-crypto-seed-2026-10-12
 * pull-check:v3-retest10-2026-10-13
 */

import { keepAlive } from "@/lib/keep-alive.server";
import "server-only";

import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { listedMarketNotice } from "@/lib/crypto-coverage";
import { coinGeckoEndpoint } from "@/lib/coingecko-auth";
import {
  MARKET_SNAPSHOT_TARGET,
  PLATFORM_DIRECTORY_TTL_MS,
  DEX_REQUEST_FRESH_MS,
  SNAPSHOT_REFRESH_MS,
  SNAPSHOT_STALE_MS,
  cleanDexRow,
  countLine,
  dedupeDexByNetworkAddress,
  dexRowComplete,
  displayCoinName,
  finiteMove,
  presentListedCoin,
  pickSnapshotCoin,
  pricesAsAtLabel,
  pricesPausedSince,
  snapshotBlockchain,
  snapshotAgeMs,
  snapshotIsStale,
  type CoinDirectoryEntry,
  type WindowMoves,
} from "@/lib/crypto-board";
import {
  DEX_NETWORKS,
  dexCallWaitMs,
  dexDetailId,
  parseMegafilterPage,
  type DexTokenRow,
} from "@/lib/crypto-dex";
import { GECKOTERMINAL_ACCEPT } from "@/lib/crypto-coingecko";
import { fetchYahooMajorMarkets } from "@/lib/crypto-yahoo";
import { snapshotTapeChange } from "@/lib/ticker-feed";
import {
  backupWithYahoo,
  loadKeylessCryptoMarkets,
  loadKeylessDexMarkets,
  withFeedSource,
  YAHOO_BACKUP_FLOOR,
  dexSourceSummary,
  lastCryptoSeedReport,
} from "@/lib/crypto-keyless-seed";
import { coinDisplayName } from "@/lib/crypto-names";
import { dedupeCoinsById, renamedCoinSymbol, resolvableCoinId, type CoinMarket } from "@/lib/crypto-market";
import { persistCryptoSnapshot, persistDexReport, persistDexSnapshot, readCryptoSnapshot, readDexSnapshot } from "@/lib/crypto-snapshot";
import { publicSourceAllowed } from "@/lib/swyftx-display";

const DIRECTORY_FILE = path.join(tmpdir(), "aetherforge-coin-directory.json");
const DIRECTORY_URL = "https://www.aetherforgeai.co.nz/__af/coin-directory";
const MARKETS_QUERY =
  "vs_currency=usd&order=market_cap_desc&per_page=250&sparkline=true&price_change_percentage=1h,24h,7d,30d";

export interface SharedCryptoBoard {
  coins: CoinMarket[];
  at: string | null;
  notice: string | null;
  delayed: boolean;
  countLine: string;
  /** b30 H-1: stored snapshot version (x-af-snapshot-version). */
  version?: number;
}

export interface SharedDexBoard {
  rows: DexTokenRow[];
  at: string | null;
  notice: string | null;
  sources: string[];
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
let nextReaderAttemptAt = 0;
let nextYahooUpgradeAt = 0;
let nextDexUpgradeAt = 0;

/** Tests start each case with a clear upgrade backoff. */
export function resetSnapshotUpgradeBackoff() {
  nextReaderAttemptAt = 0;
  nextYahooUpgradeAt = 0;
  nextDexUpgradeAt = 0;
}

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

function sparklinePrices(row: Record<string, unknown>): number[] {
  const box = row.sparkline_in_7d;
  if (!box || typeof box !== "object") return [];
  const price = (box as { price?: unknown }).price;
  if (!Array.isArray(price)) return [];
  return price.map((point) => Number(point)).filter((point) => Number.isFinite(point) && point > 0);
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
      ath: finiteMove(row.ath),
      athDate: typeof row.ath_date === "string" ? row.ath_date : null,
      atl: null,
      atlDate: null,
      sparkline7d: sparklinePrices(row),
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runCryptoSeed(): Promise<{ cryptoReplaced: boolean; cryptoRows: number }> {
  const at = new Date().toISOString();
  let coins = await loadKeylessCryptoMarkets();
  if (coins.length < YAHOO_BACKUP_FLOOR) {
    let yahoo: CoinMarket[] = [];
    try {
      yahoo = await Promise.race([
        fetchYahooMajorMarkets(),
        sleep(6_000).then(() => [] as CoinMarket[]),
      ]);
    } catch (err) {
      console.error("[crypto-board] yahoo backup failed:", err instanceof Error ? err.message.slice(0, 80) : "failed");
    }
    coins = backupWithYahoo(coins, yahoo);
  }
  if (!coins.length) return { cryptoReplaced: false, cryptoRows: 0 };
  try {
    const directory = await loadDirectory();
    if (directory) {
      coins = coins.map((coin) => {
        const listed = directory.get(coin.id);
        if (!listed) return coin;
        const fromPlatform = snapshotBlockchain(coin.id, listed.platforms, null);
        return {
          ...coin,
          name: displayCoinName(coin.symbol, coin.name, listed.name),
          blockchain: fromPlatform || coin.blockchain || "",
        };
      });
    }
  } catch (err) {
    console.error("[crypto-board] platform directory was not applied:", err instanceof Error ? err.message.slice(0, 80) : "failed");
  }
  let previousCoins: CoinMarket[] = [];
  try {
    const previous = await readCryptoSnapshot();
    previousCoins = previous?.coins ?? [];
    if (previousCoins.length) {
      const { applyStatDonors } = await import("@/lib/crypto-market");
      coins = applyStatDonors(coins, previousCoins);
    }
    if (process.env.VITEST !== "true") {
      const { enrichPaprikaGaps } = await import("@/lib/crypto-paprika");
      coins = await enrichPaprikaGaps(coins, { budgetMs: 6_000 });
    }
  } catch (err) {
    console.error("[crypto-board] paprika gap fill failed:", err instanceof Error ? err.message.slice(0, 80) : "failed");
  }
  if (previousCoins.length) {
    // G-17: a seed that omits tether or a thin coin must not erase the last full record.
    const { retainDepthCoins } = await import("@/lib/crypto-depth-record");
    coins = retainDepthCoins(coins, previousCoins);
  }
  coins = dedupeCoinsById(coins);
  await persistCryptoSnapshot(coins, at);
  const saved = await readCryptoSnapshot();
  const replaced = saved?.at === at;
  if (!replaced) console.log(`[crypto-board] crypto seed ${coins.length} kept the previous list`);
  // b24 G-05: the attempt is recorded in persistCryptoSnapshot (the one write point); wait for it.
  await flushCryptoAttempt(2_000);
  return { cryptoReplaced: replaced, cryptoRows: coins.length };
}

let dexRefreshFailure: { at: string; reason: string } | null = null;

/** Last DEX refresh that saved nothing. Shown on the admin diagnostics page. */
export function lastDexRefreshFailure(): { at: string; reason: string } | null {
  return dexRefreshFailure ? { ...dexRefreshFailure } : null;
}

function noteDexRefreshFailure(reason: string): void {
  const text = reason.trim() || "DEX refresh returned no rows. The previous snapshot was kept.";
  dexRefreshFailure = { at: new Date().toISOString(), reason: text };
  console.error(`[crypto-board] DEX refresh failed: ${text}`);
}

/** b66 TT P3: GeckoTerminal and DexPaprika results from this isolate's last DEX seed. */
function dexReportRows() {
  return lastCryptoSeedReport().filter((r) => r.source === "geckoterminal" || r.source === "dexpaprika");
}

async function runDexSeed(): Promise<{ dexReplaced: boolean; dexRows: number }> {
  const at = new Date().toISOString();
  const loaded = await loadKeylessDexMarkets();
  if (!loaded.rows.length) {
    // b64 TT P2: name each source and why it came back empty (was "did not return a list").
    const summary = dexSourceSummary();
    noteDexRefreshFailure(summary ? `${summary}. The previous snapshot was kept.` : "DEX refresh returned no rows. The previous snapshot was kept.");
    // b66 TT P3: save the per-source report with the kept snapshot so /status on any server shows it.
    await persistDexReport(dexReportRows(), at).catch(() => false);
    return { dexReplaced: false, dexRows: 0 };
  }
  dexRefreshFailure = null;
  await persistDexSnapshot(loaded.rows, at, loaded.sources, dexReportRows());
  const saved = await readDexSnapshot();
  const replaced = saved?.at === at;
  if (!replaced) console.log(`[crypto-board] DEX seed ${loaded.rows.length} kept the previous list`);
  return { dexReplaced: replaced, dexRows: loaded.rows.length };
}

let cryptoSeedInflight: Promise<{ cryptoReplaced: boolean; cryptoRows: number }> | null = null;
let dexSeedInflight: Promise<{ dexReplaced: boolean; dexRows: number }> | null = null;
let dexSeedTail: Promise<unknown> = Promise.resolve();

/**
 * Goal b13 G-17: on Workers, a promise started inside an earlier request can be
 * cancelled with that request and never settle. The in-flight guard then stayed
 * set for the life of the isolate and the crypto list stopped refreshing (471
 * min old on live). A guard older than SEED_INFLIGHT_MAX_MS is dropped.
 */
export const SEED_INFLIGHT_MAX_MS = 30_000;
let cryptoSeedStartedAt = 0;
let dexSeedStartedAt = 0;

function refreshCryptoSeed(): Promise<{ cryptoReplaced: boolean; cryptoRows: number }> {
  if (cryptoSeedInflight && Date.now() - cryptoSeedStartedAt > SEED_INFLIGHT_MAX_MS) cryptoSeedInflight = null;
  if (!cryptoSeedInflight) {
    cryptoSeedStartedAt = Date.now();
    const job = runCryptoSeed().finally(() => {
      if (cryptoSeedInflight === job) cryptoSeedInflight = null;
    });
    cryptoSeedInflight = job;
  }
  return cryptoSeedInflight;
}

function refreshDexSeed(): Promise<{ dexReplaced: boolean; dexRows: number }> {
  if (dexSeedInflight && Date.now() - dexSeedStartedAt > SEED_INFLIGHT_MAX_MS) dexSeedInflight = null;
  if (!dexSeedInflight) {
    dexSeedStartedAt = Date.now();
    const job: Promise<{ dexReplaced: boolean; dexRows: number }> = runDexSeed().finally(() => {
      if (dexSeedInflight === job) dexSeedInflight = null;
    });
    dexSeedInflight = job;
    dexSeedTail = job;
  }
  return dexSeedInflight;
}

/** The reader returns the last good list. This waits for the refresh it started. */
export function dexRefreshSettled(): Promise<void> {
  return dexSeedTail.then(
    () => undefined,
    () => undefined
  );
}

export async function refreshMarketSnapshots(): Promise<RefreshResult> {
  const started = Date.now();
  const [crypto, dex] = await Promise.all([refreshCryptoSeed(), refreshDexSeed()]);
  const result: RefreshResult = {
    cryptoReplaced: crypto.cryptoReplaced,
    dexReplaced: dex.dexReplaced,
    cryptoRows: crypto.cryptoRows,
    dexRows: dex.dexRows,
    keptPrevious: !crypto.cryptoReplaced && !dex.dexReplaced,
  };
  logStep("refresh", started, `crypto=${result.cryptoReplaced} dex=${result.dexReplaced}`);
  return result;
}

/**
 * A detached promise dies with the isolate. `after` keeps the refresh alive
 * until it writes the snapshot. Outside a request it runs immediately.
 */
function afterHookAvailable(): boolean {
  try {
    const { after } = require("next/server") as { after?: unknown };
    return typeof after === "function";
  } catch {
    return false;
  }
}

/**
 * Start the refresh immediately. `after` keeps it alive after the response
 * on the Next.js runtime. When `after` is missing, wait a short bound so the
 * write can land before the isolate stops, then return the saved list.
 */
function scheduleDetached(start: () => Promise<unknown>, inlineMs = 0): Promise<void> {
  const job = start().catch((err) => {
    console.error("[crypto-board] background refresh failed:", err instanceof Error ? err.message.slice(0, 120) : "failed");
  });
  let hooked = false;
  try {
    const { after } = require("next/server") as { after?: (task: () => Promise<unknown>) => void };
    if (typeof after === "function") {
      after(() => job);
      hooked = true;
      console.log("[crypto-board] refresh kept alive with after()");
    }
  } catch {
    hooked = false;
  }
  if (hooked && inlineMs <= 0) return Promise.resolve();
  const wait = inlineMs > 0 ? inlineMs : 400;
  console.log(`[crypto-board] after() ${hooked ? "did not extend this read" : "is not available"} — refresh inline ${wait}ms`);
  return Promise.race([job.then(() => undefined), sleep(wait)]).then(() => undefined);
}

function kickRefresh(): void {
  if (Date.now() < nextReaderAttemptAt) return;
  nextReaderAttemptAt = Date.now() + 60_000;
  scheduleDetached(() => refreshCryptoSeed());
  scheduleDetached(() => refreshDexSeed());
}

/**
 * b47 H-1 freeze (TT b46: 601 s gap; refresh only ran when a page past 10 min asked for it). Readers of
 * the tape call this; once the list is over 5 minutes old a refresh starts in the background. Single
 * flight: one try per isolate per minute (kickRefresh) and the shared crypto lease across isolates.
 */
export const SNAPSHOT_REFRESH_TRIGGER_MS = 5 * 60 * 1000;
export function kickCryptoRefreshIfOld(at: string | null | undefined): boolean {
  if (!boardNeedsRefresh(at, SNAPSHOT_REFRESH_TRIGGER_MS)) return false;
  // Only where after() keeps the work alive past the reply (the Worker): the tape never waits on it.
  if (!afterHookAvailable()) return false;
  // Unit tests simulate the store; a kick there would fetch live providers.
  if (process.env.VITEST || process.env.NODE_ENV === "test") return false;
  kickRefresh();
  return true;
}

export function refreshMarketSnapshotsNow(): Promise<RefreshResult> {
  nextReaderAttemptAt = Date.now() + 60_000;
  return refreshMarketSnapshots();
}

function gateCoins(coins: CoinMarket[]): CoinMarket[] {
  // b69 (TT b68 P2): a snapshot saved before the dedupe can still hold a second row for one id.
  const renamed = coins.map((coin) => {
    const symbol = renamedCoinSymbol(coin.symbol);
    return symbol && symbol !== coin.symbol ? { ...coin, symbol } : coin;
  });
  return dedupeCoinsById(renamed.filter((coin) => coin.price > 0 && publicSourceAllowed(coin.source)));
}

/** Goal b13 G-17: crypto older than this is shown as stale and refreshed in the request. */
export const CRYPTO_HARD_STALE_MS = 30 * 60 * 1000;

function presentCrypto(coins: CoinMarket[], at: string | null, version = 0): SharedCryptoBoard {
  const listed = coins.map((coin) => presentListedCoin(coin));
  const sources = listed.map((coin) => coin.source || "coingecko");
  const short =
    coins.length > 0 && coins.length < MARKET_SNAPSHOT_TARGET ? listedMarketNotice(coins.length, "short") : null;
  const age = snapshotAgeMs(at);
  const minutes = age != null && age > SNAPSHOT_REFRESH_MS ? Math.max(1, Math.round(age / 60_000)) : null;
  const clock = pricesAsAtLabel(at, Date.now(), SNAPSHOT_REFRESH_MS);
  const hardStale = age != null && age > CRYPTO_HARD_STALE_MS;
  const aged =
    clock && minutes != null
      ? `${clock} This list is ${minutes} minutes old.${hardStale ? " Stale: crypto trades around the clock and this list has not refreshed." : ""}`
      : clock;
  const asOf = [aged, short].filter(Boolean).join(" ");
  const notice = coins.length ? withFeedSource(asOf || null, sources) : null;
  return {
    coins: listed,
    at,
    notice,
    delayed: snapshotIsStale(at, Date.now(), SNAPSHOT_REFRESH_MS),
    countLine: countLine("coins", coins.length),
    version,
  };
}

/** b62 TT P2: how long the last good DEX list is still shown (marked delayed) when refreshes fail. */
export const DEX_LAST_GOOD_MAX_MS = 24 * 60 * 60 * 1000;

/** b62 TT P2: the delayed-list sentence. The time is the saved list's own time, never invented. */
export function dexDelayedNotice(at: string, sources: string[] = []): string {
  const label = pricesAsAtLabel(at, Date.now(), DEX_REQUEST_FRESH_MS);
  const base = `${label || "The feed is delayed."} The latest DEX refresh did not return a list, so the last good list is shown.`;
  return withFeedSource(base, sources) ?? base;
}

function presentDex(rows: DexTokenRow[], at: string | null, sources: string[]): SharedDexBoard {
  const unique = dedupeDexByNetworkAddress(rows)
    .map((row) => {
      const cleaned = cleanDexRow(row);
      if (!cleaned) return null;
      const detailId = dexDetailId(cleaned.symbol, cleaned.detailId) || resolvableCoinId(cleaned.detailId);
      return detailId ? { ...cleaned, detailId } : cleaned;
    })
    .filter((row): row is DexTokenRow => !!row && dexRowComplete(row) && !!resolvableCoinId(row.detailId));
  // b62 TT P2: a list older than 30 minutes used to be blanked ("Prices paused ... No earlier price is
  // stored") while the last good rows sat in the store. Up to DEX_LAST_GOOD_MAX_MS the last good list is
  // served, marked delayed, with its saved time. Only an older list is paused.
  if (at && unique.length && snapshotIsStale(at, Date.now(), SNAPSHOT_STALE_MS) && !snapshotIsStale(at, Date.now(), DEX_LAST_GOOD_MAX_MS)) {
    return {
      rows: unique,
      at,
      notice: dexDelayedNotice(at, sources),
      sources,
      delayed: true,
      countLine: countLine("DEX tokens", unique.length),
    };
  }
  if (at && snapshotIsStale(at, Date.now(), SNAPSHOT_STALE_MS)) {
    return {
      rows: [],
      at,
      notice: pricesPausedSince(at),
      sources,
      delayed: true,
      countLine: countLine("DEX tokens", 0),
    };
  }
  const notice = unique.length ? withFeedSource(pricesAsAtLabel(at, Date.now(), DEX_REQUEST_FRESH_MS), sources) : null;
  return {
    rows: unique,
    at,
    notice,
    sources,
    delayed: snapshotIsStale(at, Date.now(), DEX_REQUEST_FRESH_MS),
    countLine: countLine("DEX tokens", unique.length),
  };
}

/** Cold start only. A stored crypto list never waits on this. */
const EMPTY_CRYPTO_SEED_MS = 7_000;

/** A Yahoo-only or stale list may wait this long for a richer seed inside the request. */
const YAHOO_UPGRADE_BOUND_MS = 1_200; // b31 REG-1: was 8 s; the refresh continues via waitUntil

function snapshotIsYahooOnly(coins: CoinMarket[]): boolean {
  return coins.length > 0 && coins.every((coin) => (coin.source || "") === "yahoo");
}

/**
 * The markets and detail reads await this. A detached refresh dies with the
 * isolate, which is why a stored Yahoo list never gained market cap on live.
 * The ticker and Koins keep the fast snapshot read.
 */
export async function upgradeStoredCryptoBoard(boundMs = YAHOO_UPGRADE_BOUND_MS): Promise<void> {
  if (Date.now() < nextYahooUpgradeAt) return;
  const saved = await readCryptoSnapshot();
  if (!saved?.coins.length) return;
  const yahooOnly = snapshotIsYahooOnly(saved.coins);
  const short = saved.coins.length < 300;
  const stale = !saved.at || snapshotIsStale(saved.at);
  if (!yahooOnly && !short && !stale) return;
  nextYahooUpgradeAt = Date.now() + 60_000;
  const work = refreshCryptoSeed().catch(() => undefined);
  void keepAlive(work);
  await Promise.race([work, sleep(Math.min(boundMs, YAHOO_UPGRADE_BOUND_MS))]);
}

function dexSnapshotThin(rows: DexTokenRow[], sources: string[]): boolean {
  const withId = rows.filter((row) => resolvableCoinId(row.detailId));
  if (withId.length < 15) return true;
  const names = sources.map((source) => source.toLowerCase());
  return names.length > 0 && !names.includes("geckoterminal");
}

export async function readSharedCryptoBoard(opts?: { seed?: boolean; revalidate?: boolean }): Promise<SharedCryptoBoard> {
  const saved = await readCryptoSnapshot();
  const stored = saved?.coins ?? [];
  const visible = gateCoins(stored);
  // Never seed when a snapshot exists, including when the caller passes seed: false.
  if (stored.length) {
    // Goal b13 G-17: a list over 30 minutes old is refreshed inside this request
    // (bounded), as the DEX board is. A detached refresh alone left it 471 min old.
    // Goal b22 G-05: past the 10-minute list threshold a revalidating read refreshes
    // inside the request (bounded) and waits for the attempt to be recorded. The
    // detached kick alone left the list 12–16 minutes old on b19.
    if (opts?.revalidate && visible.length && boardNeedsRefresh(saved?.at, SNAPSHOT_REFRESH_MS)) {
      // b31 REG-1: bounded wait; the refresh and its attempt record finish via waitUntil.
      const work = refreshCryptoSeed().catch(() => undefined);
      void keepAlive(work);
      await Promise.race([work, sleep(REQUEST_REFRESH_BOUND_MS)]);
      const fresher = await readCryptoSnapshot();
      if (fresher?.coins?.length && (fresher.at ?? "") > (saved?.at ?? "")) {
        return presentCrypto(gateCoins(fresher.coins), fresher.at ?? null, fresher.version);
      }
      return presentCrypto(visible, saved?.at ?? null, saved?.version ?? 0);
    }
    // b47: the background kick starts at 5 minutes (labels still use the 10-minute threshold).
    if (visible.length && boardNeedsRefresh(saved?.at, SNAPSHOT_REFRESH_TRIGGER_MS)) {
      if (afterHookAvailable()) kickRefresh();
      else await scheduleDetached(() => refreshCryptoSeed(), 400);
    }
    return presentCrypto(visible, saved?.at ?? null, saved?.version ?? 0);
  }
  void opts;
  const seedWork = refreshCryptoSeed().catch(() => undefined);
  void keepAlive(seedWork);
  await Promise.race([seedWork, sleep(Math.min(EMPTY_CRYPTO_SEED_MS, REQUEST_REFRESH_BOUND_MS))]);
  const again = await readCryptoSnapshot();
  return presentCrypto(gateCoins(again?.coins ?? []), again?.at ?? null, again?.version ?? 0);
}

/** How long a visitor waits for a DEX refresh. after() keeps the rest of the run alive. */
const DEX_REFRESH_BOUND_MS = 1_200;
/** b31 REG-1: the most any page or API request waits for an in-request refresh. */
const REQUEST_REFRESH_BOUND_MS = 1_200;

function boardNeedsRefresh(at: string | null | undefined, maxAge = SNAPSHOT_REFRESH_MS): boolean {
  return !at || snapshotIsStale(at, Date.now(), maxAge);
}

/**
 * Runs inside the request when the saved DEX list is older than about 10 minutes.
 * A detached refresh dies with the isolate, so this wait is bounded.
 */
async function revalidateStaleBoards(): Promise<void> {
  const [crypto, dex] = await Promise.all([readCryptoSnapshot(), readDexSnapshot()]);
  const cryptoYahoo =
    !!crypto?.coins.length && crypto.coins.every((coin) => (coin.source || "") === "yahoo");
  const jobs: Promise<unknown>[] = [];
  if (!crypto?.coins.length || boardNeedsRefresh(crypto?.at) || cryptoYahoo) jobs.push(refreshCryptoSeed());
  const dexThin = dexSnapshotThin(dex?.rows ?? [], dex?.sources ?? []);
  if (!dex?.rows.length || boardNeedsRefresh(dex?.at, DEX_REQUEST_FRESH_MS) || dexThin) jobs.push(refreshDexSeed());
  if (!jobs.length) return;
  const all = Promise.all(jobs);
  void keepAlive(all);
  await Promise.race([all, sleep(REQUEST_REFRESH_BOUND_MS)]);
}

export async function readSharedDexBoard(opts?: { seed?: boolean; revalidate?: boolean }): Promise<SharedDexBoard> {
  const saved = await readDexSnapshot();
  const visible = (saved?.rows ?? []).filter((row) => row.price != null && row.price > 0);
  if (visible.length) {
    const thin = dexSnapshotThin(visible, saved?.sources ?? []);
    const stale = boardNeedsRefresh(saved?.at, DEX_REQUEST_FRESH_MS);
    if (opts?.revalidate && (stale || thin) && Date.now() >= nextDexUpgradeAt) {
      nextDexUpgradeAt = Date.now() + 60_000;
      // A visitor waits at most 1.5s. after() keeps the refresh alive for the cron or the next request.
      await scheduleDetached(
        () =>
          refreshDexSeed().catch((err) => {
            noteDexRefreshFailure(err instanceof Error ? err.message.slice(0, 160) : "DEX refresh failed");
            return { dexReplaced: false, dexRows: 0 };
          }),
        DEX_REFRESH_BOUND_MS
      );
      const again = await readDexSnapshot();
      const next = (again?.rows ?? []).filter((row) => row.price != null && row.price > 0);
      return presentDex(next.length ? next : visible, again?.at ?? saved?.at ?? null, again?.sources ?? saved?.sources ?? []);
    }
    return presentDex(visible, saved?.at ?? null, saved?.sources ?? []);
  }
  if (opts?.seed === false) return presentDex([], saved?.at ?? null, saved?.sources ?? []);
  await scheduleDetached(() => refreshDexSeed().catch(() => undefined), DEX_REFRESH_BOUND_MS);
  const again = await readDexSnapshot();
  return presentDex(again?.rows ?? [], again?.at ?? null, again?.sources ?? []);
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
  // The confirm path reads the stored rows. It does not cold-seed a 7s list.
  const [crypto, dex] = await Promise.all([readCryptoSnapshot(), readDexSnapshot()]);
  const coin = pickSnapshotCoin(crypto?.coins ?? [], { symbol, coinId });
  if (coin && coin.price > 0) {
    return { price: coin.price, quotedAt: crypto?.at ?? null, source: "snapshot", stale: snapshotIsStale(crypto?.at) };
  }
  const dexRow = (dex?.rows ?? []).find((row) => {
    const rowAddress = (row.address || "").toLowerCase();
    if (address && rowAddress && (rowAddress === address || rowAddress.endsWith(address))) return true;
    if (coinId && (row.detailId === coinId || row.id === coinId)) return true;
    return symbol ? row.symbol.toUpperCase() === symbol : false;
  });
  if (dexRow?.price && dexRow.price > 0) {
    return { price: dexRow.price, quotedAt: dex?.at ?? null, source: "snapshot", stale: snapshotIsStale(dex?.at) };
  }
  return null;
}

async function paprikaQuote(symbol: string): Promise<SnapshotPrice | null> {
  const searchRes = await fetch(
    `https://api.coinpaprika.com/v1/search?q=${encodeURIComponent(symbol)}&c=currencies&modifier=symbol&limit=5`,
    { headers: { accept: "application/json" }, signal: AbortSignal.timeout(800) }
  );
  if (!searchRes.ok) return null;
  const searchBody = (await searchRes.json()) as { currencies?: Array<{ id?: string; symbol?: string }> };
  const match = (searchBody.currencies || []).find((row) => String(row.symbol || "").toUpperCase() === symbol);
  const id = String(match?.id || "").trim();
  if (!id) return null;
  const tickerRes = await fetch(`https://api.coinpaprika.com/v1/tickers/${encodeURIComponent(id)}?quotes=USD`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(800),
  });
  if (!tickerRes.ok) return null;
  const ticker = (await tickerRes.json()) as { last_updated?: string; quotes?: { USD?: { price?: unknown } } };
  const price = Number(ticker.quotes?.USD?.price);
  if (!(price > 0)) return null;
  return {
    price,
    quotedAt: typeof ticker.last_updated === "string" ? ticker.last_updated : new Date().toISOString(),
    source: "recent",
    stale: false,
  };
}

/** A saved quote younger than this is used as-is. An older one is refreshed. */
export const CONFIRM_QUOTE_FRESH_MS = 60_000;

/**
 * Confirm uses a quote younger than a minute. An older quote is refreshed for
 * at most 400ms. When that refresh does not return, the saved price is kept
 * and its original quotedAt is the pxat.
 */
export async function confirmCryptoQuote(input: {
  symbol?: string | null;
  coinId?: string | null;
  address?: string | null;
}): Promise<SnapshotPrice | null> {
  const stored = await priceFromSnapshot(input);
  const parsed = stored?.quotedAt ? Date.parse(stored.quotedAt) : Number.NaN;
  const age = Number.isFinite(parsed) ? Date.now() - parsed : Number.POSITIVE_INFINITY;
  if (stored && stored.price > 0 && age >= 0 && age < CONFIRM_QUOTE_FRESH_MS) return stored;
  const symbol = (input.symbol || "").trim().toUpperCase();
  if (!symbol) return stored;
  try {
    let timedOut = false;
    const fresh = await Promise.race([
      paprikaQuote(symbol),
      sleep(400).then(() => {
        timedOut = true;
        return null as SnapshotPrice | null;
      }),
    ]);
    if (fresh && fresh.price > 0) return fresh;
    if (timedOut && stored && stored.price > 0) return stored;
  } catch (err) {
    console.error("[crypto-board] confirm quote refresh failed:", err instanceof Error ? err.message.slice(0, 80) : "failed");
  }
  return stored && stored.price > 0 ? stored : null;
}

export async function snapshotQuotesForSymbols(
  symbols: string[]
): Promise<Record<string, { price: number; changePct?: number; source: string; quotedAt: string | null }>> {
  const board = await readSharedCryptoBoard({ seed: false });
  return quotesFromCoins(board.coins, board.at, symbols);
}

/** b35 H-1: tape quotes from one list (the request's single snapshot read). */
export function quotesFromCoins(
  coins: CoinMarket[],
  at: string | null,
  symbols: string[]
): Record<string, { price: number; changePct?: number; source: string; quotedAt: string | null }> {
  const board = { coins, at };
  const out: Record<string, { price: number; changePct?: number; source: string; quotedAt: string | null }> = {};
  for (const raw of symbols) {
    const symbol = raw.trim().toUpperCase();
    const coin = board.coins.find((row) => row.symbol.toUpperCase() === symbol);
    if (!coin || !(coin.price > 0)) continue;
    const change = snapshotTapeChange(coin);
    out[symbol] = {
      price: coin.price,
      changePct: change == null ? undefined : change,
      source: (coin.source || "").toLowerCase(),
      quotedAt: coin.quotedAt || board.at || null,
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
  const board = await readSharedCryptoBoard({ seed: false });
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
