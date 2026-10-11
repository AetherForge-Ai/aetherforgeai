/**
 * Last good crypto and DEX lists.
 *
 * An in-process map dies when a Cloudflare isolate stops. The temp file used
 * for DEX rows does not survive that either. This module writes the JSON to
 * the Workers Cache API (`caches.default`), which is part of this runtime
 * (wrangler.jsonc has no KV binding, only ASSETS) and outlives the isolate
 * in that colo. A hidden watchlist row is a second copy only when the JSON
 * fits the existing name field. Totalum reads are given a short timeout.
 *
 * The tickers AF-CGS and AF-DXS are not holdings. Watchlist GET hides them
 * and POST rejects them.
 *
 * pull-check:crypto-live-2026-10-11
 */

import "server-only";

import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { DexTokenRow } from "@/lib/crypto-dex";
import type { CoinMarket } from "@/lib/crypto-market";
import { totalumSdk } from "@/lib/totalum";

export const CRYPTO_SNAPSHOT_TICKER = "AF-CGS";
export const DEX_SNAPSHOT_TICKER = "AF-DXS";

/** A Totalum read that takes longer than this is skipped. */
export const SNAPSHOT_READ_TIMEOUT_MS = 400;

/**
 * Watchlist `name` is the existing text field (same slot as AF-WEM).
 * A 400-row list is larger than this, so the full list stays on the Cache API.
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
}

export interface CryptoSnapshot {
  at: string;
  coins: CoinMarket[];
}

export interface DexSnapshot {
  at: string;
  rows: DexTokenRow[];
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
  memoryCrypto = null;
  memoryDex = null;
}

export function resetCryptoSnapshotsForTests() {
  memoryCrypto = null;
  memoryDex = null;
  durableOverride = null;
}

function num(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
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
    high24h: num(value.high24h),
    low24h: num(value.low24h),
    circulatingSupply: num(value.circulatingSupply),
    totalSupply: num(value.totalSupply),
    maxSupply: num(value.maxSupply),
    ath: null,
    athDate: null,
    atl: null,
    atlDate: null,
    sparkline7d: [],
    blockchain: typeof value.blockchain === "string" ? value.blockchain : "",
    quotedAt: typeof value.quotedAt === "string" ? value.quotedAt : null,
    source: "coingecko",
    priceUnavailable: false,
  };
}

function dexLooksSaved(value: unknown): value is DexTokenRow {
  if (!value || typeof value !== "object") return false;
  const row = value as DexTokenRow;
  return typeof row.symbol === "string" && row.symbol.length > 0 && typeof row.price === "number" && row.price > 0;
}

/** A Yahoo major list has no market cap. It is not stored as the last good list. */
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

function encodeCrypto(coins: CoinMarket[], at: string): string {
  const rows = coins.slice(0, 400).map((coin) => ({
    id: coin.id,
    symbol: coin.symbol,
    name: coin.name,
    image: coin.image || "",
    rank: coin.rank,
    price: coin.price,
    marketCap: coin.marketCap,
    volume24h: coin.volume24h,
    change1h: coin.change1h,
    change24h: coin.change24h,
    change7d: coin.change7d,
    quotedAt: coin.quotedAt || null,
    blockchain: coin.blockchain || "",
  }));
  return JSON.stringify({ v: 1, at, coins: rows });
}

function parseCrypto(raw: string | null | undefined): CryptoSnapshot | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { at?: unknown; coins?: unknown };
    const at = typeof parsed.at === "string" ? parsed.at : "";
    const coins = Array.isArray(parsed.coins) ? parsed.coins.filter(coinLooksSaved).map((row) => coinFromSnapshot(row)) : [];
    if (!at || coins.length < 100) return null;
    return { at, coins };
  } catch {
    return null;
  }
}

function encodeDex(rows: DexTokenRow[], at: string): string {
  return JSON.stringify({
    v: 1,
    at,
    rows: rows.slice(0, 400).map((row) => ({
      id: row.id,
      symbol: row.symbol,
      name: row.name,
      price: row.price,
      priceUnavailable: false,
      volume24h: row.volume24h,
      network: row.network,
      dex: row.dex,
      detailId: row.detailId,
      address: row.address,
      reserveUsd: row.reserveUsd,
    })),
  });
}

function parseDex(raw: string | null | undefined): DexSnapshot | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { at?: unknown; rows?: unknown };
    const at = typeof parsed.at === "string" ? parsed.at : "";
    const rows = Array.isArray(parsed.rows) ? parsed.rows.filter(dexLooksSaved) : [];
    if (!at || !rows.length) return null;
    return { at, rows };
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
  const rows = ((res as { data?: { _id?: string; ticker?: string; name?: string }[] })?.data || []);
  const row = rows.find((item) => String(item.ticker || "").toUpperCase() === ticker);
  if (!row?._id) return null;
  return { id: String(row._id), name: typeof row.name === "string" ? row.name : "" };
}

async function readWatchlist(id: SnapshotId): Promise<string | null> {
  const row = await findWatchlistRow(TICKER[id]);
  return row?.name || null;
}

async function writeWatchlist(id: SnapshotId, body: string): Promise<boolean> {
  if (body.length > WATCHLIST_SNAPSHOT_MAX) return false;
  const ticker = TICKER[id];
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

async function defaultRead(id: SnapshotId): Promise<string | null> {
  try {
    const cached = await readWorkersCache(id);
    if (cached) return cached;
  } catch (err) {
    console.error("[crypto-snapshot] cache read failed:", err instanceof Error ? err.message.slice(0, 80) : "failed");
  }
  try {
    const stored = await readWatchlist(id);
    if (stored) return stored;
  } catch (err) {
    console.error("[crypto-snapshot] watchlist read failed:", err instanceof Error ? err.message.slice(0, 80) : "failed");
  }
  return readTempFile(id);
}

async function defaultWrite(id: SnapshotId, body: string): Promise<boolean> {
  let saved = false;
  try {
    saved = (await writeWorkersCache(id, body)) || saved;
  } catch (err) {
    console.error("[crypto-snapshot] cache write failed:", err instanceof Error ? err.message.slice(0, 80) : "failed");
  }
  writeTempFile(id, body);
  if (body.length <= WATCHLIST_SNAPSHOT_MAX) {
    void writeWatchlist(id, body).catch((err) => {
      console.error("[crypto-snapshot] watchlist write failed:", err instanceof Error ? err.message.slice(0, 80) : "failed");
    });
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
  const read = durableOverride ? durableOverride.read(id) : defaultRead(id);
  return withTimeout(read, timeoutMs);
}

async function writeRaw(id: SnapshotId, body: string): Promise<void> {
  if (durableOverride) {
    await durableOverride.write(id, body);
    return;
  }
  await defaultWrite(id, body);
}

export async function readCryptoSnapshot(timeoutMs = SNAPSHOT_READ_TIMEOUT_MS): Promise<CryptoSnapshot | null> {
  if (memoryCrypto) return memoryCrypto;
  const raw = await readRaw("crypto", timeoutMs);
  const parsed = parseCrypto(raw);
  if (parsed) memoryCrypto = parsed;
  return parsed;
}

export async function readDexSnapshot(timeoutMs = SNAPSHOT_READ_TIMEOUT_MS): Promise<DexSnapshot | null> {
  if (memoryDex) return memoryDex;
  const raw = await readRaw("dex", timeoutMs);
  const parsed = parseDex(raw);
  if (parsed) memoryDex = parsed;
  return parsed;
}

export async function persistCryptoSnapshot(coins: CoinMarket[], at = new Date().toISOString()): Promise<void> {
  const tagged = coins.map((coin) => ({ ...coin, source: coin.source || "coingecko" }));
  if (!snapshotWorthSaving(tagged)) return;
  const body = encodeCrypto(tagged, at);
  const parsed = parseCrypto(body);
  if (!parsed) return;
  memoryCrypto = parsed;
  await writeRaw("crypto", body);
}

export async function persistDexSnapshot(rows: DexTokenRow[], at = new Date().toISOString()): Promise<void> {
  const live = rows.filter(dexLooksSaved).slice(0, 400);
  if (!live.length) return;
  const body = encodeDex(live, at);
  const parsed = parseDex(body);
  if (!parsed) return;
  memoryDex = parsed;
  await writeRaw("dex", body);
}

export function hiddenSnapshotTicker(ticker: string | null | undefined): boolean {
  const key = (ticker || "").trim().toUpperCase();
  return key === CRYPTO_SNAPSHOT_TICKER || key === DEX_SNAPSHOT_TICKER;
}
