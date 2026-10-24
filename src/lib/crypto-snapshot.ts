import { swrMemo } from "@/lib/swr-memo";
/**
 * Last good crypto and DEX lists.
 *
 * On Workers the Cache API is per colo and the temp file is per isolate.
 * The hidden watchlist rows AF-CGS and AF-DXS are the durable copy. They are
 * read first. A colo cache or a temp file is used only when it is newer, or
 * when the database row is missing. A read never comes back empty while any
 * of those copies still has rows. The list is stored as compact arrays. When
 * one name field is not enough, the rest is split across AF-CGS-1..N and
 * AF-DXS-1..N. No new column.
 *
 * The tickers AF-CGS, AF-DXS and their numbered rows are not holdings.
 * Watchlist GET hides them and POST rejects them.
 *
 * pull-check:crypto-live-2026-10-11
 * pull-check:v3-crypto-seed-2026-10-12
 * pull-check:v3-retest10-2026-10-13
 */

import "server-only";
import { edgeSnapshotPut, runtimeErrorClass } from "@/lib/ticker-serve";

import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import { recordCryptoAttempt, registerDurableAttemptStore } from "@/lib/crypto-attempts";
import { DEX_REQUEST_FRESH_MS, dexSnapshotComplete, snapshotIsStale } from "@/lib/crypto-board";
import type { DexTokenRow } from "@/lib/crypto-dex";
import { resolvableCoinId, type CoinMarket } from "@/lib/crypto-market";
import { publicSourceAllowed } from "@/lib/swyftx-display";
import { totalumSdk } from "@/lib/totalum";
import { keepAlive } from "@/lib/keep-alive.server";

export const CRYPTO_SNAPSHOT_TICKER = "AF-CGS";
export const DEX_SNAPSHOT_TICKER = "AF-DXS";
/** b28 G-05: hidden ownerless row holding the last crypto list refresh attempt. */
export const CRYPTO_ATTEMPT_TICKER = "AF-CAT";

/** A Cache API read that takes longer than this is skipped. The database row is not. */
export const SNAPSHOT_READ_TIMEOUT_MS = 400;

/** How long a cold read waits for the durable watchlist row when nothing else parsed. */
export const SNAPSHOT_DB_TIMEOUT_MS = 1_500;

/**
 * b31 REG-1: hard cap on any store read a render or API request waits for. On a timeout the
 * in-memory last-good snapshot is served. Writes never block a request (background only).
 */
export const STORE_HARD_TIMEOUT_MS = 1_500;

/**
 * Watchlist `name` is the existing text field (same slot as AF-WEM).
 * One field holds a compact chunk. A longer list continues on AF-CGS-1..N.
 */
export const WATCHLIST_SNAPSHOT_MAX = 24_000;

const CACHE_URL = {
  crypto: "https://www.aetherforgeai.co.nz/__af/crypto-last-good",
  dex: "https://www.aetherforgeai.co.nz/__af/dex-last-good",
} as const;

const FILE_PATH = {
  crypto: path.join(tmpdir(), "aetherforge-crypto-last-good.json"),
  dex: path.join(tmpdir(), "aetherforge-dex-last-good.json"),
} as const;

const TICKER = {
  crypto: CRYPTO_SNAPSHOT_TICKER,
  dex: DEX_SNAPSHOT_TICKER,
} as const;

export type SnapshotId = "crypto" | "dex";

export interface SnapshotDurable {
  read(id: SnapshotId): Promise<string | null>;
  write(id: SnapshotId, body: string): Promise<boolean>;
  /** b35 H-1: the refresh lease row (one refresh write at a time). Optional for older test stores. */
  readLease?(): Promise<string | null>;
  writeLease?(body: string): Promise<boolean>;
}

/** b35 H-1: lease row ticker (hidden from every holdings list). */
export const CRYPTO_LEASE_TICKER = "AF-CLS";
/** A refresh lease lives this long; a crashed holder never blocks refreshes for longer. */
export const CRYPTO_LEASE_MS = 10_000;
/** After writing the lease, wait this long and read it back; only the holder still named writes. */
export const CRYPTO_LEASE_SETTLE_MS = 120;
/** A per-request shared-copy check is reused for this long (one check serves a burst of reads). */
export const SHARED_CHECK_REUSE_MS = 250;
/** b35 H-1: the per-request shared-copy check waits at most this long (Workers cache is ~ms). */
export const SHARED_CHECK_TIMEOUT_MS = 150;

/**
 * b35 H-1 (GOAL-LOCK #25): the version is the snapshot's own as-of in epoch ms. TT saw one
 * number name two snapshots (v30 = 07:18:36.751 and 07:18:38.334) and newer lists get lower
 * numbers: a counter bumped by read-then-write cannot be atomic on this store. A time-derived
 * version is unique per snapshot and can only rise with as-of, whichever server writes it.
 */
export function versionFor(at: string): number {
  const t = Date.parse(at);
  return Number.isFinite(t) ? t : 0;
}

export interface CryptoSnapshot {
  at: string;
  coins: CoinMarket[];
  /** b30 H-1: monotonic version of the stored row (0 for rows written before b30). */
  version: number;
  /** b30 H-1: the list's primary provider, as stored. */
  source: string | null;
}

/** b66 TT P3: one upstream DEX source's result on the last refresh, saved with the snapshot. */
export interface DexSourceNote {
  source: string;
  status: number | null;
  rows: number;
  reason: string | null;
}

export interface DexSnapshot {
  at: string;
  rows: DexTokenRow[];
  sources: string[];
  /** b66 TT P3: per-source report from the last refresh attempt (even one that saved no rows). */
  report?: DexSourceNote[];
  reportAt?: string | null;
}

function cleanDexReport(value: unknown): DexSourceNote[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((r): r is Record<string, unknown> => !!r && typeof r === "object" && typeof (r as { source?: unknown }).source === "string")
    .slice(0, 8)
    .map((r) => ({
      source: String(r.source).slice(0, 40),
      status: typeof r.status === "number" && Number.isFinite(r.status) ? r.status : null,
      rows: typeof r.rows === "number" && Number.isFinite(r.rows) && r.rows > 0 ? Math.floor(r.rows) : 0,
      reason: typeof r.reason === "string" && r.reason.trim() ? r.reason.replace(/\s+/g, " ").trim().slice(0, 160) : null,
    }));
}

interface CacheGlobal {
  default?: {
    match(request: Request): Promise<Response | undefined>;
    put(request: Request, response: Response): Promise<void>;
  };
}

let memoryCrypto: CryptoSnapshot | null = null;
let memoryDex: DexSnapshot | null = null;
let durableOverride: SnapshotDurable | null = null;

export function installSnapshotDurable(store: SnapshotDurable | null) {
  durableOverride = store;
}

/** Drops the in-process copy. The durable store is left in place. */
export function clearSnapshotMemory() {
  memoryCryptoCheckedAt = 0;
  memoryCrypto = null;
  memoryDex = null;
}

export function resetCryptoSnapshotsForTests() {
  memoryCryptoCheckedAt = 0;
  memoryCrypto = null;
  memoryDex = null;
  durableOverride = null;
}

function num(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
}

function parseMoves(value: unknown): { h24: number | null; d7: number | null; d30: number | null } | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const one = (key: string): number | null => {
    if (row[key] == null || row[key] === "") return null;
    return num(row[key]);
  };
  return { h24: one("h24"), d7: one("d7"), d30: one("d30") };
}

function coinLooksSaved(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === "string" && typeof row.symbol === "string" && num(row.price) != null && (num(row.price) as number) > 0;
}

export function coinFromSnapshot(value: Record<string, unknown>): CoinMarket {
  const price = num(value.price) as number;
  const marketCap = num(value.marketCap) ?? 0;
  const volume24h = num(value.volume24h) ?? 0;
  return {
    id: String(value.id),
    symbol: String(value.symbol).toUpperCase(),
    name: typeof value.name === "string" && value.name.trim() ? value.name : String(value.symbol).toUpperCase(),
    image: typeof value.image === "string" ? value.image : "",
    rank: num(value.rank) ?? 999999,
    price,
    marketCap,
    fdv: num(value.fdv),
    volume24h,
    change1h: num(value.change1h),
    change24h: num(value.change24h) ?? 0,
    change7d: num(value.change7d) ?? 0,
    moves: parseMoves(value.moves),
    high24h: num(value.high24h),
    low24h: num(value.low24h),
    circulatingSupply: num(value.circulatingSupply),
    totalSupply: num(value.totalSupply),
    maxSupply: num(value.maxSupply),
    ath: num(value.ath),
    athDate: typeof value.athDate === "string" ? value.athDate : null,
    atl: num(value.atl),
    atlDate: typeof value.atlDate === "string" ? value.atlDate : null,
    sparkline7d: compactSpark(Array.isArray(value.sparkline7d) ? (value.sparkline7d as unknown[]).map((point) => num(point)) : []),
    blockchain: typeof value.blockchain === "string" ? value.blockchain : "",
    quotedAt: typeof value.quotedAt === "string" ? value.quotedAt : null,
    source: typeof value.source === "string" && value.source.trim() ? value.source.trim().toLowerCase() : "coingecko",
    priceUnavailable: false,
  };
}

function dexLooksSaved(value: unknown): value is DexTokenRow {
  if (!value || typeof value !== "object") return false;
  const row = value as DexTokenRow;
  return typeof row.symbol === "string" && row.symbol.length > 0 && typeof row.price === "number" && row.price > 0;
}

/**
 * True when this list may replace a longer stored snapshot.
 * A Yahoo major list has no market cap, so it does not replace a stored list.
 * An empty store can still keep that shorter verified seed.
 */
export function snapshotWorthSaving(coins: CoinMarket[]): boolean {
  if (!coins.length || coins.length < 100) return false;
  const priced = coins.filter(
    (coin) =>
      coin.price > 0 &&
      coin.marketCap > 0 &&
      (coin.source || "coingecko") !== "yahoo" &&
      (coin.source || "coingecko") !== "swyftx"
  );
  return priced.length >= 100;
}

/** At most 24 points so a 400-row list still fits the existing name field. */
function compactSpark(values: Array<number | null | undefined> | undefined): number[] {
  const clean = (values || []).filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0);
  const rounded = clean.map((value) => roundCompact(value)).filter((value): value is number => value != null && value > 0);
  if (rounded.length <= 24) return rounded;
  const out: number[] = [];
  for (let i = 0; i < 24; i += 1) {
    out.push(rounded[Math.round((i * (rounded.length - 1)) / 23)]);
  }
  return out;
}

/** Eight significant figures. Small coin prices stay, and the name field stays short. */
function roundCompact(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  const abs = Math.abs(value);
  if (abs === 0) return 0;
  const factor = 10 ** (7 - Math.floor(Math.log10(abs)));
  const rounded = Math.round(value * factor) / factor;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function encodeCrypto(coins: CoinMarket[], at: string, ver = 0, src: string | null = null): string {
  const rows = coins.slice(0, 400).map((coin) => [
    coin.id,
    coin.symbol,
    coin.name,
    Math.round(coin.rank) || 999999,
    roundCompact(coin.price),
    roundCompact(coin.marketCap) ?? 0,
    roundCompact(coin.volume24h) ?? 0,
    roundCompact(coin.change24h) ?? 0,
    roundCompact(coin.change7d) ?? 0,
    roundCompact(coin.change1h),
    roundCompact(coin.fdv),
    roundCompact(coin.high24h),
    roundCompact(coin.low24h),
    roundCompact(coin.circulatingSupply),
    roundCompact(coin.totalSupply),
    roundCompact(coin.maxSupply),
    roundCompact(coin.ath),
    roundCompact(coin.atl),
    coin.blockchain || "",
    (coin.source || "coingecko").toLowerCase(),
    coin.quotedAt || null,
    coin.athDate || null,
    coin.atlDate || null,
    roundCompact(coin.moves?.h24 ?? null),
    roundCompact(coin.moves?.d7 ?? null),
    roundCompact(coin.moves?.d30 ?? null),
    coin.image || "",
    compactSpark(coin.sparkline7d),
  ]);
  return JSON.stringify({ v: 2, at, ver, src, n: rows.length, coins: rows });
}

function coinFromCompact(row: unknown[]): CoinMarket | null {
  const id = row[0];
  const symbol = row[1];
  const price = num(row[4]);
  if (typeof id !== "string" || typeof symbol !== "string" || price == null || !(price > 0)) return null;
  const h24 = num(row[23]);
  const d7 = num(row[24]);
  const d30 = num(row[25]);
  return {
    id,
    symbol: symbol.toUpperCase(),
    name: typeof row[2] === "string" && row[2].trim() ? row[2] : symbol.toUpperCase(),
    image: typeof row[26] === "string" ? row[26] : "",
    rank: num(row[3]) ?? 999999,
    price,
    marketCap: num(row[5]) ?? 0,
    fdv: num(row[10]),
    volume24h: num(row[6]) ?? 0,
    change1h: num(row[9]),
    change24h: num(row[7]) ?? 0,
    change7d: num(row[8]) ?? 0,
    moves: h24 == null && d7 == null && d30 == null ? null : { h24, d7, d30 },
    high24h: num(row[11]),
    low24h: num(row[12]),
    circulatingSupply: num(row[13]),
    totalSupply: num(row[14]),
    maxSupply: num(row[15]),
    ath: num(row[16]),
    athDate: typeof row[21] === "string" ? row[21] : null,
    atl: num(row[17]),
    atlDate: typeof row[22] === "string" ? row[22] : null,
    sparkline7d: compactSpark(Array.isArray(row[27]) ? (row[27] as unknown[]).map((point) => num(point)) : []),
    blockchain: typeof row[18] === "string" ? row[18] : "",
    quotedAt: typeof row[20] === "string" ? row[20] : null,
    source: typeof row[19] === "string" && row[19].trim() ? row[19].trim().toLowerCase() : "coingecko",
    priceUnavailable: false,
  };
}

function parseCrypto(raw: string | null | undefined): CryptoSnapshot | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { at?: unknown; coins?: unknown; ver?: unknown; src?: unknown };
    const at = typeof parsed.at === "string" ? parsed.at : "";
    const version = typeof parsed.ver === "number" && Number.isFinite(parsed.ver) ? parsed.ver : 0;
    const list = Array.isArray(parsed.coins) ? parsed.coins : [];
    const compact = list.length > 0 && list.every((row) => Array.isArray(row));
    const coins = compact
      ? list.map((row) => coinFromCompact(row as unknown[])).filter((row): row is CoinMarket => !!row)
      : list.filter(coinLooksSaved).map((row) => coinFromSnapshot(row as Record<string, unknown>));
    if (!at || !coins.length) return null;
    const source = typeof parsed.src === "string" && parsed.src ? parsed.src : primarySnapshotSource(coins);
    return { at, coins, version, source };
  } catch {
    return null;
  }
}

function encodeDex(rows: DexTokenRow[], at: string, sources: string[] = [], report: DexSourceNote[] = [], reportAt: string | null = null): string {
  const live = rows.slice(0, 400);
  return JSON.stringify({
    v: 2,
    at,
    n: live.length,
    sources,
    report: cleanDexReport(report),
    reportAt,
    rows: live.map((row) => [
      row.id,
      row.symbol,
      row.name,
      roundCompact(row.price),
      roundCompact(row.volume24h),
      row.network,
      row.dex,
      row.detailId,
      row.address || "",
      roundCompact(row.reserveUsd),
    ]),
  });
}

function dexFromCompact(row: unknown[]): DexTokenRow | null {
  const symbol = row[1];
  const price = num(row[3]);
  if (typeof symbol !== "string" || !symbol || price == null || !(price > 0)) return null;
  return {
    id: typeof row[0] === "string" && row[0] ? row[0] : symbol,
    symbol,
    name: typeof row[2] === "string" && row[2] ? row[2] : symbol,
    price,
    priceUnavailable: false,
    volume24h: num(row[4]),
    network: typeof row[5] === "string" ? row[5] : "",
    dex: typeof row[6] === "string" ? row[6] : "",
    detailId: typeof row[7] === "string" ? row[7] : null,
    address: typeof row[8] === "string" && row[8] ? row[8] : undefined,
    reserveUsd: num(row[9]),
  };
}

function parseDex(raw: string | null | undefined): DexSnapshot | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { at?: unknown; rows?: unknown; sources?: unknown; report?: unknown; reportAt?: unknown };
    const at = typeof parsed.at === "string" ? parsed.at : "";
    const list = Array.isArray(parsed.rows) ? parsed.rows : [];
    const compact = list.length > 0 && list.every((row) => Array.isArray(row));
    const rows = compact
      ? list.map((row) => dexFromCompact(row as unknown[])).filter((row): row is DexTokenRow => !!row)
      : list.filter(dexLooksSaved);
    const sources = Array.isArray(parsed.sources)
      ? parsed.sources.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : [];
    if (!at || !rows.length) return null;
    const report = cleanDexReport(parsed.report);
    const reportAt = typeof parsed.reportAt === "string" && parsed.reportAt ? parsed.reportAt : null;
    return { at, rows, sources, report, reportAt };
  } catch {
    return null;
  }
}

function cacheGlobal(): CacheGlobal["default"] | null {
  const caches = (globalThis as { caches?: CacheGlobal }).caches;
  return caches?.default ?? null;
}

async function readWorkersCache(id: SnapshotId): Promise<string | null> {
  const cache = cacheGlobal();
  if (!cache) return null;
  const hit = await cache.match(new Request(CACHE_URL[id]));
  if (!hit) return null;
  return hit.text();
}

async function writeWorkersCache(id: SnapshotId, body: string): Promise<boolean> {
  const cache = cacheGlobal();
  if (!cache) return false;
  await cache.put(
    new Request(CACHE_URL[id]),
    new Response(body, {
      headers: {
        "content-type": "application/json",
        "cache-control": "public, max-age=604800",
      },
    })
  );
  return true;
}

function readTempFile(id: SnapshotId): string | null {
  try {
    return readFileSync(FILE_PATH[id], "utf8");
  } catch {
    return null;
  }
}

function writeTempFile(id: SnapshotId, body: string) {
  try {
    writeFileSync(FILE_PATH[id], body);
  } catch (err) {
    console.error(
      "[crypto-snapshot] temp file was not saved:",
      err instanceof Error ? err.message.slice(0, 80) : "failed"
    );
  }
}

async function findWatchlistRow(ticker: string): Promise<{ id: string; name: string } | null> {
  const res = await totalumSdk.crud.query("watchlist", {
    _filter: { ticker },
    _limit: 5,
  });
  const rows = ((res as { data?: { _id?: string; ticker?: string; name?: string; user?: unknown }[] })?.data || []);
  // b28: only the ownerless system row; never a member's row with the same ticker.
  const row = rows.find((item) => !item.user && String(item.ticker || "").toUpperCase() === ticker);
  if (!row?._id) return null;
  return { id: String(row._id), name: typeof row.name === "string" ? row.name : "" };
}

function unpackWatchlist(raw: string): string {
  if (!raw.startsWith("z1:")) return raw;
  try {
    return gunzipSync(Buffer.from(raw.slice(3), "base64")).toString("utf8");
  } catch {
    return "";
  }
}

/** The full list, or null. A shorter prefix is not stored in its place. */
export function fitWatchlistBody(body: string): string | null {
  return packWatchlistBody(body);
}

export interface WatchlistPayload {
  header: string;
  chunks: string[];
}

function chunkTicker(id: SnapshotId, index: number): string {
  return `${TICKER[id]}-${index}`;
}

function largestChunk(parsed: Record<string, unknown>, key: string, list: unknown[], start: number, max: number): { end: number; packed: string } | null {
  let lo = start + 1;
  let hi = list.length;
  let best: { end: number; packed: string } | null = null;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const body = JSON.stringify({
      v: 2,
      at: parsed.at,
      n: list.length,
      part: mid - start,
      ...(typeof parsed.ver === "number" ? { ver: parsed.ver } : {}),
      ...(Array.isArray(parsed.sources) ? { sources: parsed.sources } : {}),
      [key]: list.slice(start, mid),
    });
    const packed = packWatchlistBody(body, max);
    if (packed) {
      best = { end: mid, packed };
      lo = mid + 1;
    } else if (mid === start + 1) {
      return null;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}

/**
 * One name field when the compact list fits. Otherwise a header plus
 * AF-CGS-1..N / AF-DXS-1..N chunks. Never a truncated prefix.
 */
export function splitWatchlistPayload(body: string, max = WATCHLIST_SNAPSHOT_MAX): WatchlistPayload | null {
  const packed = packWatchlistBody(body, max);
  if (packed) return { header: packed, chunks: [] };
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(body) as Record<string, unknown>;
  } catch {
    return null;
  }
  const key = Array.isArray(parsed.coins) ? "coins" : Array.isArray(parsed.rows) ? "rows" : "";
  if (!key) return null;
  const list = parsed[key] as unknown[];
  const chunks: string[] = [];
  let start = 0;
  while (start < list.length) {
    const slice = largestChunk(parsed, key, list, start, max);
    if (!slice || slice.end <= start) return null;
    chunks.push(slice.packed);
    start = slice.end;
  }
  const header = JSON.stringify({
    v: 2,
    at: parsed.at,
    n: list.length,
    parts: chunks.length,
    ...(typeof parsed.ver === "number" ? { ver: parsed.ver } : {}),
    ...(typeof parsed.src === "string" ? { src: parsed.src } : {}),
    ...(Array.isArray(parsed.sources) ? { sources: parsed.sources } : {}),
  });
  if (header.length > max) return null;
  return { header, chunks };
}

/** Join a header and its chunks back into one snapshot body. */
export function joinWatchlistPayload(headerRaw: string, chunks: string[]): string | null {
  const header = unpackWatchlist(headerRaw);
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(header) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (typeof parsed.parts !== "number") return header;
  const rows: unknown[] = [];
  let listKey = "";
  for (const chunk of chunks) {
    let part: Record<string, unknown>;
    try {
      part = JSON.parse(unpackWatchlist(chunk)) as Record<string, unknown>;
    } catch {
      return null;
    }
    // b30 H-1: a chunk from another version means a torn read (header and chunks from two
    // writers); refuse it so the reader keeps its copy instead of mixing two lists.
    if (typeof parsed.ver === "number" && part.ver !== parsed.ver) return null;
    const partKey = Array.isArray(part.coins) ? "coins" : Array.isArray(part.rows) ? "rows" : "";
    if (!partKey) return null;
    listKey = partKey;
    rows.push(...(part[partKey] as unknown[]));
  }
  if (!listKey) return null;
  const { parts: _parts, ...rest } = parsed;
  void _parts;
  return JSON.stringify({ ...rest, n: rows.length, [listKey]: rows });
}

/** Gzip into the existing name field when the JSON is longer than that field. */
export function packWatchlistBody(body: string, max = WATCHLIST_SNAPSHOT_MAX): string | null {
  if (body.length <= max) return body;
  const packed = `z1:${gzipSync(Buffer.from(body, "utf8")).toString("base64")}`;
  return packed.length <= max ? packed : null;
}

/**
 * b49 H-1 (TT b48: one 503 with durable=miss at 865 ms while a snapshot existed 9 s earlier): the
 * outcome of the last stored-copy read, so /api/ticker can say why it missed. Values are short safe
 * words: ok, no-row, empty, parse, torn-missing, torn-version, timeout, error-<class>. Best effort
 * (the last read in this isolate), never a secret or a body.
 */
let lastCryptoReadOutcome = "none";
export function cryptoReadOutcome(): string {
  return lastCryptoReadOutcome;
}
function noteOutcome(id: SnapshotId, outcome: string) {
  if (id === "crypto") lastCryptoReadOutcome = outcome;
}
/** b49: a short, header-safe error class (e.g. error-typeerror), never the message. */
export function errorClass(err: unknown): string {
  return runtimeErrorClass(err); // b50: known runtime messages map to fixed words
}

async function readWatchlistOnce(id: SnapshotId): Promise<{ raw: string | null; outcome: string }> {
  const row = await findWatchlistRow(TICKER[id]);
  if (!row) return { raw: null, outcome: "no-row" };
  if (!row.name) return { raw: null, outcome: "empty" };
  const raw = unpackWatchlist(row.name);
  if (!raw) return { raw: null, outcome: "parse" };
  let parts = 0;
  try {
    const parsed = JSON.parse(raw) as { parts?: unknown };
    parts = typeof parsed.parts === "number" ? parsed.parts : 0;
  } catch {
    return { raw: null, outcome: "parse" };
  }
  if (parts < 1) return { raw, outcome: "ok" };
  const stored = await Promise.all(
    Array.from({ length: parts }, (_, index) => findWatchlistRow(chunkTicker(id, index + 1)))
  );
  if (stored.some((part) => !part?.name)) return { raw: null, outcome: "torn-missing" };
  const joined = joinWatchlistPayload(row.name, stored.map((part) => part?.name || ""));
  return joined ? { raw: joined, outcome: "ok" } : { raw: null, outcome: "torn-version" };
}

/** b49: retry gap after a torn read (a writer was mid-way: chunks are written before the header). */
export const TORN_READ_RETRY_MS = 250;
async function readWatchlist(id: SnapshotId): Promise<string | null> {
  let res: { raw: string | null; outcome: string };
  try {
    res = await readWatchlistOnce(id);
  } catch (err) {
    res = { raw: null, outcome: errorClass(err) };
  }
  // b49 H-1: a torn read is retried once; the writer's header lands within ms.
  // b50 P1: only a torn read — a store error is not retried (each retry spends 1 + N subrequests, and
  // the Worker's per-request subrequest budget is shared with the NZX/ASX fetch).
  if (!res.raw && res.outcome.startsWith("torn-")) {
    await new Promise((r) => setTimeout(r, TORN_READ_RETRY_MS));
    try {
      const again = await readWatchlistOnce(id);
      res = again.raw ? { raw: again.raw, outcome: "ok-retry" } : { raw: null, outcome: `${again.outcome}` };
    } catch (err) {
      res = { raw: null, outcome: errorClass(err) };
    }
  }
  noteOutcome(id, res.outcome);
  if (!res.raw && res.outcome.startsWith("error-")) throw new Error(res.outcome);
  return res.raw;
}

async function writeNamedWatchlist(ticker: string, body: string): Promise<boolean> {
  if (body.length > WATCHLIST_SNAPSHOT_MAX) return false;
  const existing = await findWatchlistRow(ticker);
  if (existing) {
    await totalumSdk.crud.editRecordById("watchlist", existing.id, { name: body });
    return true;
  }
  await totalumSdk.crud.createRecord("watchlist", {
    ticker,
    name: body,
    asset_type: "stock",
    market: "US",
  });
  return true;
}

async function writeWatchlist(id: SnapshotId, body: string): Promise<boolean> {
  return writeNamedWatchlist(TICKER[id], body);
}

async function deleteExtraChunks(id: SnapshotId, keep: number): Promise<void> {
  for (let index = keep + 1; index <= keep + 16; index += 1) {
    const row = await findWatchlistRow(chunkTicker(id, index));
    if (!row) continue;
    await totalumSdk.crud.deleteRecordById("watchlist", row.id).catch(() => undefined);
  }
}

function snapshotAt(raw: string | null | undefined): number {
  if (!raw) return 0;
  try {
    const at = Date.parse(String((JSON.parse(raw) as { at?: unknown }).at || ""));
    return Number.isFinite(at) ? at : 0;
  } catch {
    return 0;
  }
}

function snapshotHasRows(id: SnapshotId, raw: string | null | undefined): boolean {
  if (!raw) return false;
  return id === "crypto" ? parseCrypto(raw) != null : parseDex(raw) != null;
}

/** Parsed rows, not the stamped count. A truncated body cannot claim the full list. */
export function snapshotRowCount(id: SnapshotId, raw: string | null | undefined): number {
  if (!raw) return 0;
  if (id === "crypto") return parseCrypto(raw)?.coins.length ?? 0;
  return parseDex(raw)?.rows.length ?? 0;
}

/**
 * A newer copy wins. When both copies share a timestamp, the one with more
 * rows wins, so a truncated database row does not hide a full local list.
 */
export function chooseSnapshotRaw(id: SnapshotId, db: string | null, local: string | null): string | null {
  const durable = snapshotHasRows(id, db) ? db : null;
  const nearby = snapshotHasRows(id, local) ? local : null;
  if (durable && nearby) {
    const atDurable = snapshotAt(durable);
    const atNearby = snapshotAt(nearby);
    if (atDurable !== atNearby) return atDurable > atNearby ? durable : nearby;
    const rowsDurable = snapshotRowCount(id, durable);
    const rowsNearby = snapshotRowCount(id, nearby);
    if (rowsDurable !== rowsNearby) return rowsDurable > rowsNearby ? durable : nearby;
    return durable;
  }
  return durable || nearby;
}

async function readLocalSnapshot(id: SnapshotId): Promise<string | null> {
  try {
    const cached = await withTimeout(readWorkersCache(id), SNAPSHOT_READ_TIMEOUT_MS);
    if (cached && snapshotHasRows(id, cached)) return cached;
  } catch (err) {
    console.error("[crypto-snapshot] cache read failed:", err instanceof Error ? err.message.slice(0, 80) : "failed");
  }
  const file = readTempFile(id);
  return snapshotHasRows(id, file) ? file : null;
}

function rememberRaw(id: SnapshotId, raw: string | null) {
  if (!snapshotHasRows(id, raw)) return;
  if (id === "crypto") {
    const parsed = parseCrypto(raw);
    if (!parsed) return;
    if (!memoryCrypto || newerCrypto(parsed, memoryCrypto)) memoryCrypto = parsed;
    return;
  }
  const parsed = parseDex(raw);
  if (!parsed) return;
  if (!memoryDex || parsed.at >= memoryDex.at) memoryDex = parsed;
}

/** First copy that already has rows. Does not wait for a slower copy. */
function firstSnapshotRaw(id: SnapshotId, works: Promise<string | null>[]): Promise<string | null> {
  return new Promise((resolve) => {
    let open = works.length;
    let settled = false;
    if (!open) {
      resolve(null);
      return;
    }
    for (const work of works) {
      work.then(
        (raw) => {
          if (!settled && snapshotHasRows(id, raw)) {
            settled = true;
            resolve(raw);
          }
          open -= 1;
          if (!settled && open === 0) resolve(null);
        },
        () => {
          open -= 1;
          if (!settled && open === 0) resolve(null);
        }
      );
    }
  });
}

async function defaultRead(id: SnapshotId): Promise<string | null> {
  const file = readTempFile(id);
  if (snapshotHasRows(id, file)) return file;
  noteOutcome(id, "pending");
  const db = readWatchlist(id).catch((err) => {
    console.error("[crypto-snapshot] watchlist read failed:", err instanceof Error ? err.message.slice(0, 80) : "failed");
    return null;
  });
  const cache = withTimeout(readWorkersCache(id), SNAPSHOT_READ_TIMEOUT_MS);
  const first = await firstSnapshotRaw(id, [cache, withTimeout(db, SNAPSHOT_DB_TIMEOUT_MS)]);
  if (first && lastCryptoReadOutcome === "pending") noteOutcome(id, "ok-cache");
  else if (!first && lastCryptoReadOutcome === "pending") noteOutcome(id, "timeout");
  void Promise.all([cache, db])
    .then(([cached, fromDb]) => {
      const chosen = chooseSnapshotRaw(id, fromDb, cached);
      if (chosen && chosen !== first) rememberRaw(id, chosen);
    })
    .catch(() => undefined);
  return first;
}

async function defaultWrite(id: SnapshotId, body: string): Promise<boolean> {
  let saved = false;
  try {
    saved = (await writeWorkersCache(id, body)) || saved;
  } catch (err) {
    console.error("[crypto-snapshot] cache write failed:", err instanceof Error ? err.message.slice(0, 80) : "failed");
  }
  writeTempFile(id, body);
  const split = splitWatchlistPayload(body);
  if (!split) {
    console.error("[crypto-snapshot] watchlist row was not saved: the list does not fit the name field");
    return saved;
  }
  try {
    // b30 H-1: chunks first, header last. The header (with its version) is the commit point.
    for (let index = 0; index < split.chunks.length; index += 1) {
      saved = (await writeNamedWatchlist(chunkTicker(id, index + 1), split.chunks[index])) || saved;
    }
    saved = (await writeWatchlist(id, split.header)) || saved;
    await deleteExtraChunks(id, split.chunks.length);
  } catch (err) {
    console.error("[crypto-snapshot] watchlist write failed:", err instanceof Error ? err.message.slice(0, 80) : "failed");
  }
  return saved;
}

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      }
    );
  });
}

async function readRaw(id: SnapshotId, timeoutMs: number): Promise<string | null> {
  if (durableOverride) {
    noteOutcome(id, "pending");
    const raw = await withTimeout(
      durableOverride.read(id).then(
        (raw) => (raw ? raw : (noteOutcome(id, "no-row"), null)),
        (err) => (noteOutcome(id, errorClass(err)), null)
      ),
      Math.min(timeoutMs, STORE_HARD_TIMEOUT_MS)
    );
    if (lastCryptoReadOutcome === "pending") noteOutcome(id, raw ? (snapshotHasRows(id, raw) ? "ok" : "parse") : "timeout");
    return raw;
  }
  return withTimeout(defaultRead(id), STORE_HARD_TIMEOUT_MS);
}

async function writeRaw(id: SnapshotId, body: string): Promise<void> {
  if (durableOverride) {
    await durableOverride.write(id, body);
    return;
  }
  await defaultWrite(id, body);
}

/**
 * b30 H-1: one shared, versioned snapshot. The durable row carries `ver` (bumped on every
 * write by compare-and-set), `at` and `src`. This isolate keeps a copy for at most
 * SNAPSHOT_LOCAL_TTL_MS; after that every read re-reads the durable row before rendering
 * and adopts it only when it is not older (higher version, or same version and a later
 * as-of). So no isolate can serve an as-of older than one it, or the store, has already
 * shown. If the store cannot be read in time the copy in memory is served (never an older one).
 */
export const SNAPSHOT_LOCAL_TTL_MS = 3_000;
/** @deprecated b29 name, kept for older tests: the local copy now lives SNAPSHOT_LOCAL_TTL_MS. */
export const MEMORY_RECHECK_MS = SNAPSHOT_LOCAL_TTL_MS;
let memoryCryptoCheckedAt = 0;
let durableRefresh: Promise<void> | null = null;

function newerCrypto(a: CryptoSnapshot, b: CryptoSnapshot): boolean {
  // b35 H-1: as-of decides (versions follow as-of); a same-as-of tie keeps the higher version.
  const ta = Date.parse(a.at);
  const tb = Date.parse(b.at);
  if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) return ta > tb;
  return a.version >= b.version;
}

let sharedCheck: { at: number; work: Promise<void> } | null = null;

/** b35 H-1: the colo-shared copy (Workers cache in production; the store in tests). */
async function readSharedCrypto(): Promise<string | null> {
  if (durableOverride) return durableOverride.read("crypto");
  return readWorkersCache("crypto");
}

/** One bounded shared-copy check per SHARED_CHECK_REUSE_MS, adopted only if newer. */
function checkShared(timeoutMs: number): Promise<void> {
  // Reuse only a check still in flight: a finished check may predate another server's commit.
  const now = Date.now();
  if (sharedCheck && now - sharedCheck.at < SHARED_CHECK_REUSE_MS) return sharedCheck.work;
  const work = withTimeout(readSharedCrypto(), timeoutMs)
    .then((raw) => rememberRaw("crypto", raw))
    .finally(() => {
      if (sharedCheck?.work === work) sharedCheck = null;
    });
  sharedCheck = { at: now, work };
  return work;
}

async function readDurableCrypto(timeoutMs: number): Promise<string | null> {
  return durableOverride
    ? withTimeout(durableOverride.read("crypto"), timeoutMs)
    : withTimeout(readWatchlist("crypto"), timeoutMs);
}

function refreshCryptoFromDurable(timeoutMs = STORE_HARD_TIMEOUT_MS): Promise<void> {
  durableRefresh ??= (async () => {
    try {
      rememberRaw("crypto", await readDurableCrypto(timeoutMs));
      memoryCryptoCheckedAt = Date.now();
    } catch {
      /* keep memory */
    }
  })().finally(() => {
    durableRefresh = null;
  });
  return durableRefresh;
}

export interface SnapshotReadOptions {
  /** b35 H-1: the highest version this client has already been served (cookie or header). */
  floor?: number;
}

export async function readCryptoSnapshot(timeoutMs = SNAPSHOT_READ_TIMEOUT_MS, opts: SnapshotReadOptions = {}): Promise<CryptoSnapshot | null> {
  const now = Date.now();
  if (memoryCrypto) {
    // b35 H-1: every request checks the shared copy (bounded, deduplicated), so an isolate
    // whose memory lags never serves a list older than one another isolate already served.
    await checkShared(Math.min(timeoutMs, SHARED_CHECK_TIMEOUT_MS));
    const floor = opts.floor ?? 0;
    if (floor > 0 && memoryCrypto.version < floor) {
      // The client has seen a newer list than this isolate knows: read the store (bounded).
      rememberRaw("crypto", await readDurableCrypto(STORE_HARD_TIMEOUT_MS).catch(() => null));
      memoryCryptoCheckedAt = Date.now();
    }
    if (now - memoryCryptoCheckedAt >= SNAPSHOT_LOCAL_TTL_MS) {
      // b31 REG-1: re-read the stored row in the background. A request never waits on the
      // store once this isolate has a last-good copy; memory only moves forward (newerCrypto).
      memoryCryptoCheckedAt = now;
      void keepAlive(refreshCryptoFromDurable(STORE_HARD_TIMEOUT_MS));
    }
    return memoryCrypto;
  }
  // b35 H-1: a cold isolate waits (bounded, 1.5 s) for the stored copy rather than serving [].
  const raw = await readRaw("crypto", timeoutMs === SNAPSHOT_READ_TIMEOUT_MS ? STORE_HARD_TIMEOUT_MS : timeoutMs);
  rememberRaw("crypto", raw);
  memoryCryptoCheckedAt = now;
  if (!durableOverride) void keepAlive(refreshCryptoFromDurable(STORE_HARD_TIMEOUT_MS));
  return memoryCrypto;
}

/**
 * b30 H-1: the same stamp as <meta> tags for HTML pages (App Router pages cannot set
 * response headers while rendering), read from the stored snapshot.
 */
/** b64 TT P3: the meta-tag read is a short stale-while-revalidate memo (was a store read per render). */
const snapshotMetaMemo = swrMemo<Record<string, string>>(
  async () => snapshotHeaders(await readCryptoSnapshot().catch(() => null)),
  { freshMs: 3_000, staleMs: 10 * 60 * 1000, keep: (meta) => Object.keys(meta).length > 0 }
);

export async function snapshotMetaOther(): Promise<Record<string, string>> {
  return snapshotMetaMemo.get();
}

export function resetSnapshotMetaMemo(): void {
  snapshotMetaMemo.reset();
}

/** b30 H-1: response headers naming the snapshot a page or API was built from. */
export function snapshotHeaders(snap: Pick<CryptoSnapshot, "at" | "version"> | null | undefined): Record<string, string> {
  if (!snap) return {};
  return { "x-af-snapshot-at": snap.at, "x-af-snapshot-version": String(snap.version ?? 0) };
}

/** Most common per-row source in a list (the list's primary provider). */
export function primarySnapshotSource(coins: Array<{ source?: string | null }>): string | null {
  const counts = new Map<string, number>();
  for (const c of coins) {
    const k = (c.source || "").toLowerCase();
    if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  let best: string | null = null;
  let n = 0;
  for (const [k, v] of counts) if (v > n) [best, n] = [k, v];
  return best;
}

/** b62 TT P2: when this isolate last re-read the stored DEX row. */
let memoryDexCheckedAt = 0;

export async function readDexSnapshot(timeoutMs = SNAPSHOT_READ_TIMEOUT_MS): Promise<DexSnapshot | null> {
  if (memoryDex) {
    // b62 TT P2: an isolate used to keep its first DEX copy for its whole life, so a list saved by
    // another isolate (or the cron route) never reached it and it kept serving an old time. Like the
    // crypto row, the stored copy is re-read after SNAPSHOT_LOCAL_TTL_MS; memory only moves forward.
    if (Date.now() - memoryDexCheckedAt >= SNAPSHOT_LOCAL_TTL_MS) {
      memoryDexCheckedAt = Date.now();
      rememberRaw("dex", await readRaw("dex", Math.min(timeoutMs, STORE_HARD_TIMEOUT_MS)).catch(() => null));
    }
    return memoryDex;
  }
  memoryDexCheckedAt = Date.now();
  const raw = await readRaw("dex", timeoutMs);
  rememberRaw("dex", raw);
  return memoryDex;
}

export { CRYPTO_PARTIAL_REFRESH_AFTER_MS, CRYPTO_ROW_DELAYED_AFTER_MS, mergeStaleCryptoList, unionCryptoList, cryptoRowDelayed } from "@/lib/crypto-row-delay";
import { CRYPTO_PARTIAL_REFRESH_AFTER_MS, countMergeableRows, mergeStaleCryptoList, unionCryptoList } from "@/lib/crypto-row-delay";

/** A refreshed list must keep at least this share of the saved list's rows to replace it. */
export const CRYPTO_REPLACE_MIN_SHARE = 0.9;
/** After this age a shorter verified list may replace the saved one (matches the amber band). */
export const CRYPTO_REPLACE_ANY_AFTER_MS = 15 * 60 * 1000;
/** b30 H-1: the primary provider of the shared list. */
export const PRIMARY_CRYPTO_SOURCE = "coingecko";
/**
 * b30 H-1 (documented threshold): a fallback provider's list replaces the primary's only
 * once the stored primary list is older than this (10 minutes).
 */
export const FALLBACK_REPLACES_PRIMARY_AFTER_MS = 10 * 60 * 1000;

/** b41 H-1: the exact guard reason for /status: which check, source, row counts and saved age. */
function guardDetail(check: string, existing: CryptoSnapshot, incoming: CoinMarket[], ageMs: number): string {
  const age = Number.isFinite(ageMs) ? `${Math.max(0, Math.round(ageMs / 1000))}s` : "unknown";
  return `check=${check} source=${primarySnapshotSource(incoming) ?? "unknown"} rows=${incoming.length}/${existing.coins.length} mergeable=${countMergeableRows(existing, incoming)} savedAge=${age}`;
}

export async function persistCryptoSnapshot(coins: CoinMarket[], at = new Date().toISOString()): Promise<void> {
  const tagged = coins
    .map((coin) => ({ ...coin, source: (coin.source || "coingecko").toLowerCase() }))
    .filter((coin) => coin.price > 0 && publicSourceAllowed(coin.source));
  if (!tagged.length) {
    recordCryptoAttempt(false, new Error("unavailable: no priced coins"));
    return;
  }
  const existing = memoryCrypto ?? (await readCryptoSnapshot());
  // A shorter list must not replace a longer verified list, even when the
  // shorter list itself has prices and market caps.
  if (existing) {
    const existingVerified = snapshotWorthSaving(existing.coins);
    const incomingVerified = snapshotWorthSaving(tagged);
    if (!incomingVerified) {
      // b38 H-1 (Chief ruling 1): once the saved list is over 10 minutes old, a shorter or unverified
      // list (e.g. Yahoo's 11 majors) refreshes the coins it matches; every other row keeps its own
      // true quotedAt, so no old price ever carries a fresh time. Rows over 15 min show "delayed".
      const staleAge = Date.parse(at) - Date.parse(existing.at || "");
      const merged = Number.isFinite(staleAge) && staleAge > CRYPTO_PARTIAL_REFRESH_AFTER_MS ? mergeStaleCryptoList(existing, tagged, at) : null;
      if (!merged) {
        recordCryptoAttempt(false, new Error("unavailable: list not verified"), Date.now(), guardDetail("unverified", existing, tagged, staleAge));
        return;
      }
      const work = persistCryptoDurable(merged, at, existing.version ?? 0);
      pendingSnapshotWrite = work;
      await keepAlive(work);
      return;
    }
    // b24 G-05: a verified refresh that is only a few coins shorter (coins drop out of the top
    // 400 between calls) must still replace the list, or the clock never moves. Only a list
    // that lost more than 10% of the rows is refused.
    // Once the saved list is older than 15 minutes (amber), any verified list of 100+ coins replaces it.
    const existingAge = Date.parse(at) - Date.parse(existing.at || "");
    const existingAmber = !Number.isFinite(existingAge) || existingAge > CRYPTO_REPLACE_ANY_AFTER_MS;
    if (existingVerified && !existingAmber && tagged.length < Math.floor(existing.coins.length * CRYPTO_REPLACE_MIN_SHARE)) {
      // b41 H-1 (TT: snapshot stuck 15m16s): a verified but shorter list used to wait for the 15-minute
      // amber band. After 10 minutes its rows that pass the per-row checks merge into the saved list.
      // H-1 (b57): union, not replace — coins the shorter list lacks stay, marked delayed.
      const merged = Number.isFinite(existingAge) && existingAge > CRYPTO_PARTIAL_REFRESH_AFTER_MS ? unionCryptoList(existing, tagged, at) : null;
      if (!merged) {
        recordCryptoAttempt(false, new Error("unavailable: shorter list kept the previous one"), Date.now(), guardDetail("shorter", existing, tagged, existingAge));
        return;
      }
      const work = persistCryptoDurable(merged, at, existing.version ?? 0);
      pendingSnapshotWrite = work;
      await keepAlive(work);
      return;
    }
    // b29 H-1: compare-and-set on as-of. An older list never replaces a newer one.
    if (Number.isFinite(existingAge) && existingAge < 0) {
      recordCryptoAttempt(false, new Error("unavailable: a newer list is already saved"));
      return;
    }
    // H-1 (b57, TT health 22 Oct: 400 → 365 → 264): past the amber band a shorter verified list used
    // to replace the saved one wholesale, so every page-2 failure shrank the list for good. Keep the
    // last good rows (own quotedAt → "delayed") and refresh/add what the new list has.
    if (existingVerified && tagged.length < existing.coins.length) {
      const work = persistCryptoDurable(unionCryptoList(existing, tagged, at), at, existing.version ?? 0);
      pendingSnapshotWrite = work;
      await keepAlive(work);
      return;
    }
    // b29 H-1: a fallback provider's list does not silently replace the primary one while the
    // primary is still fresh (CoinPaprika's 393 rows swapped in and prices disagreed).
    const existingPrimary = primarySnapshotSource(existing.coins);
    const incomingPrimary = primarySnapshotSource(tagged);
    const primaryFresh = Number.isFinite(existingAge) && existingAge <= FALLBACK_REPLACES_PRIMARY_AFTER_MS;
    if (existingVerified && primaryFresh && existingPrimary && incomingPrimary && existingPrimary !== incomingPrimary && existingPrimary === PRIMARY_CRYPTO_SOURCE) {
      recordCryptoAttempt(false, new Error(`unavailable: ${incomingPrimary} list kept the fresher ${existingPrimary} list`), Date.now(), guardDetail("fallback-vs-fresh-primary", existing, tagged, existingAge));
      return;
    }
  }
  // b31 REG-1: the versioned compare-and-set write runs in the background (waitUntil). The
  // request that produced the list returns at once; this isolate serves the new list now.
  // b35 H-1: commit, then serve. This isolate adopts the new list only after the store holds it,
  // so no client can be served a list another isolate cannot yet see (that was a step-back).
  const expected = existing?.version ?? 0;
  const work = persistCryptoDurable(tagged, at, expected);
  pendingSnapshotWrite = work;
  await keepAlive(work);
}

let pendingSnapshotWrite: Promise<void> | null = null;
/** Tests: wait for the background snapshot write. */
export async function flushSnapshotWrites(): Promise<void> {
  await pendingSnapshotWrite?.catch(() => undefined);
}

async function persistCryptoDurable(tagged: CoinMarket[], at: string, expected: number): Promise<void> {
  void expected;
  // b35 H-1: one refresh write at a time. Take the lease, then re-read the stored row under it and
  // write only if ours is newer (a conditional write: as-of strictly later than the stored one).
  const lease = await acquireCryptoLease();
  if (!lease) {
    recordCryptoAttempt(false, new Error("unavailable: refresh lease held by another server"));
    return;
  }
  try {
    await commitUnderLease(tagged, at);
  } finally {
    await releaseCryptoLease(lease);
  }
}

async function commitUnderLease(tagged: CoinMarket[], at: string): Promise<void> {
  const stored = parseCrypto(await readDurableCrypto(STORE_HARD_TIMEOUT_MS).catch(() => null));
  if (stored && versionFor(stored.at) >= versionFor(at)) {
    rememberRaw("crypto", encodeCrypto(stored.coins, stored.at, stored.version, stored.source));
    recordCryptoAttempt(false, new Error("unavailable: another server saved a newer list first"));
    return;
  }
  const version = versionFor(at);
  const body = encodeCrypto(tagged, at, version, primarySnapshotSource(tagged));
  const parsed = parseCrypto(body);
  if (!parsed) return;
  await writeRaw("crypto", body);
  if (!memoryCrypto || newerCrypto(parsed, memoryCrypto)) {
    memoryCrypto = parsed;
    memoryCryptoCheckedAt = Date.now();
  }
  // b45 H-1 (c): the writer also refreshes the colo copy, so a cookie client whose floor came from this
  // write finds it in the colo even when another isolate's store read still lags (TT b42: −41 s / −43 s).
  await keepAlive(edgeSnapshotPut(parsed).catch(() => undefined));
  // b24 G-05: one write point, so every path that refreshes the list fills /status.
  recordCryptoAttempt(true);
}

let leaseSeq = 0;
function leaseHolder(): string {
  leaseSeq += 1;
  const rand = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}`;
  return `${rand}-${leaseSeq}`;
}

async function readLeaseRaw(): Promise<string | null> {
  if (durableOverride) return durableOverride.readLease ? durableOverride.readLease() : null;
  return (await findWatchlistRow(CRYPTO_LEASE_TICKER))?.name || null;
}

async function writeLeaseRaw(body: string): Promise<boolean> {
  if (durableOverride) return durableOverride.writeLease ? durableOverride.writeLease(body) : true;
  return writeNamedWatchlist(CRYPTO_LEASE_TICKER, body);
}

function parseLease(raw: string | null): { holder: string; until: number } | null {
  try {
    const v = raw ? (JSON.parse(raw) as { holder?: unknown; until?: unknown }) : null;
    return v && typeof v.holder === "string" && typeof v.until === "number" ? { holder: v.holder, until: v.until } : null;
  } catch {
    return null;
  }
}

/** b35 H-1: take the refresh lease, or null when another server holds a live one. */
export async function acquireCryptoLease(now = Date.now()): Promise<string | null> {
  if (durableOverride && !durableOverride.writeLease) return "no-lease-store";
  const current = parseLease(await withTimeout(readLeaseRaw(), STORE_HARD_TIMEOUT_MS));
  if (current && current.until > now) return null;
  const holder = leaseHolder();
  await withTimeout(writeLeaseRaw(JSON.stringify({ holder, until: now + CRYPTO_LEASE_MS })), STORE_HARD_TIMEOUT_MS);
  await new Promise((r) => setTimeout(r, CRYPTO_LEASE_SETTLE_MS));
  const after = parseLease(await withTimeout(readLeaseRaw(), STORE_HARD_TIMEOUT_MS));
  return after?.holder === holder ? holder : null;
}

async function releaseCryptoLease(holder: string): Promise<void> {
  if (holder === "no-lease-store") return;
  const current = parseLease(await withTimeout(readLeaseRaw(), STORE_HARD_TIMEOUT_MS));
  if (current?.holder === holder) await withTimeout(writeLeaseRaw(JSON.stringify({ holder, until: 0 })), STORE_HARD_TIMEOUT_MS);
}

export async function persistDexSnapshot(
  rows: DexTokenRow[],
  at = new Date().toISOString(),
  sources: string[] = [],
  report: DexSourceNote[] = []
): Promise<void> {
  const live = rows.filter((row) => dexLooksSaved(row) && !!resolvableCoinId(row.detailId)).slice(0, 400);
  if (!live.length) return;
  const existing = memoryDex ?? (await readDexSnapshot());
  const existingLive = existing ? existing.rows.filter((row) => !!resolvableCoinId(row.detailId)) : [];
  const existingStale = !existing?.at || snapshotIsStale(existing.at, Date.now(), DEX_REQUEST_FRESH_MS);
  // A fresh seed of at least 15 rows may replace a longer stale list so the clock moves.
  if (existing && existingLive.length > live.length && !dexSnapshotComplete(live)) {
    if (!(existingStale && live.length >= 15)) return;
  }
  const body = encodeDex(live, at, sources.length ? sources : existing?.sources || [], report, report.length ? at : null);
  const parsed = parseDex(body);
  if (!parsed) return;
  memoryDex = parsed;
  // b31 REG-1: background write; never blocks the request.
  const work = writeRaw("dex", body);
  pendingSnapshotWrite = work;
  await keepAlive(work);
}

/**
 * b66 TT P3: a refresh that saved no rows still records why, on the saved snapshot (kept rows and
 * time unchanged), so every server's /status reads the same per-source note.
 */
export async function persistDexReport(report: DexSourceNote[], reportAt = new Date().toISOString()): Promise<boolean> {
  const clean = cleanDexReport(report);
  if (!clean.length) return false;
  const existing = memoryDex ?? (await readDexSnapshot());
  if (!existing) return false;
  const body = encodeDex(existing.rows, existing.at, existing.sources, clean, reportAt);
  const parsed = parseDex(body);
  if (!parsed) return false;
  memoryDex = parsed;
  const work = writeRaw("dex", body);
  pendingSnapshotWrite = work;
  await keepAlive(work);
  return true;
}

export function hiddenSnapshotTicker(ticker: string | null | undefined): boolean {
  const key = (ticker || "").trim().toUpperCase();
  return key === "AF-FIFT" || key === "AF-BV" || key === "AF-SLO" || key === CRYPTO_SNAPSHOT_TICKER || key === DEX_SNAPSHOT_TICKER || key === CRYPTO_ATTEMPT_TICKER || key === CRYPTO_LEASE_TICKER || /^AF-CGS-\d+$/.test(key) || /^AF-DXS-\d+$/.test(key);
}

// b28 G-05: the refresh-attempt record shares this durable store (see crypto-attempts.ts).
registerDurableAttemptStore({
  read: async () => (await findWatchlistRow(CRYPTO_ATTEMPT_TICKER))?.name || null,
  write: (body: string) => writeNamedWatchlist(CRYPTO_ATTEMPT_TICKER, body),
});
