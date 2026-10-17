/**
 * Public post limit (CR-2 / CR-5).
 * Storage order: a durable counter store (Totalum table `rate_limit_counter`,
 * registered by durable-counter.server.ts) shared by every isolate and region;
 * then the Cloudflare Cache API (per colo); then this isolate's memory Map as the
 * last backstop. A durable store error never lets a request through unlimited:
 * the cache and memory counts still apply.
 * The address is CF-Connecting-IP only. X-Forwarded-For is not read.
 */

import { edgeRateLimit, type EdgeLimiterName } from "@/lib/edge-rate-limit";

/** Six messages a minute. A seventh inside that minute is refused. */
export const PERSONAL_GUIDE_LIMIT = 6;
export const PERSONAL_GUIDE_WINDOW_MS = 60 * 1000;
/** Five contact messages a minute. A sixth inside that minute is refused. */
export const CONTACT_LIMIT = 5;
export const CONTACT_WINDOW_MS = 60 * 1000;
export const RATE_WINDOW_MS = 60 * 60 * 1000;
export const PUBLIC_INPUT_CAP = 2000;
export const NO_CF_IP = "no-cf-ip";
export const RATE_LIMIT_ADDRESS_REQUIRED = "A network address is required.";

type RateCache = {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
};

const buckets = new Map<string, number>();

/** A counter shared by every isolate. increment returns the new count for the key. */
export interface DurableCounterStore {
  increment(storageKey: string, windowMs: number, now: number): Promise<number>;
}

let durableStore: DurableCounterStore | null = null;

export function setDurableCounterStore(store: DurableCounterStore | null): void {
  durableStore = store;
}

export function hasDurableCounterStore(): boolean {
  return durableStore != null;
}

export function resetRateLimits(): void {
  buckets.clear();
}

/** Sign-in area limits (CR-5). Failed or not, every POST counts. */
export const AUTH_SIGN_IN_LIMIT = 10;
export const AUTH_SIGN_IN_WINDOW_MS = 5 * 60 * 1000;
export const AUTH_SIGN_UP_LIMIT = 10;
export const AUTH_SIGN_UP_WINDOW_MS = 60 * 60 * 1000;
export const AUTH_RESET_LIMIT = 5;
export const AUTH_RESET_WINDOW_MS = 15 * 60 * 1000;
/** Other public POST bodies (free trial, waitlist, client error beacons). */
export const PUBLIC_POST_LIMIT = 30;
export const PUBLIC_POST_WINDOW_MS = 60 * 1000;

export function rateLimitIdentity(
  req: Request,
  nodeEnv = process.env.NODE_ENV
): { ok: true; ip: string } | { ok: false } {
  const cf = req.headers.get("cf-connecting-ip")?.trim() || "";
  if (cf) return { ok: true, ip: cf };
  // No CF-Connecting-IP (Totalum preview, a server-to-server call, or a direct
  // origin hit). These share one bucket so the form and guide never break.
  void nodeEnv;
  return { ok: true, ip: NO_CF_IP };
}

export function rateLimitStorageKey(key: string, windowMs: number, now: number): string {
  return `rl:${key}:${Math.floor(now / windowMs)}`;
}

function cacheRequest(storageKey: string): Request {
  return new Request(`https://aetherforgeai.co.nz/__rl/${encodeURIComponent(storageKey)}`);
}

function sharedCache(): RateCache | null {
  const caches = (globalThis as { caches?: { default?: RateCache } }).caches;
  return caches?.default ?? null;
}

async function readShared(storageKey: string): Promise<number | null> {
  const cache = sharedCache();
  if (!cache) return null;
  try {
    const hit = await cache.match(cacheRequest(storageKey));
    if (!hit) return null;
    const count = Number(await hit.text());
    return Number.isFinite(count) && count >= 0 ? count : null;
  } catch {
    return null;
  }
}

async function writeShared(storageKey: string, count: number): Promise<void> {
  const cache = sharedCache();
  if (!cache) return;
  try {
    await cache.put(
      cacheRequest(storageKey),
      new Response(String(count), { headers: { "Cache-Control": "public, max-age=3600" } })
    );
  } catch {
    // The memory map still bounds this isolate.
  }
}

/** Which counter decided the result: shared across regions, per colo, or this isolate only. */
export type RateLimitStore = "edge" | "durable" | "cache" | "memory";
export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  limit: number;
  resetSec: number;
  store?: RateLimitStore;
  keyHash?: string;
};

export async function takeRateLimit(
  key: string,
  limit: number,
  windowMs = RATE_WINDOW_MS,
  now = Date.now(),
  opts: { edge?: EdgeLimiterName } = {}
): Promise<RateLimitResult> {
  const storageKey = rateLimitStorageKey(key, windowMs, now);
  const resetSec = Math.max(1, Math.ceil((windowMs - (now % windowMs)) / 1000));
  // Hard floor (b7): this isolate refuses after `limit` whatever any store says.
  // The slot is reserved before any await so a burst here cannot all read zero.
  const count = (buckets.get(storageKey) ?? 0) + 1;
  buckets.set(storageKey, count);
  if (count > limit) {
    return { allowed: false, remaining: 0, limit, resetSec, store: "memory", keyHash: keyHash(key) };
  }
  // b7: the Workers rate-limit binding is shared by every isolate at the edge.
  if (opts.edge) {
    const edge = await edgeRateLimit(opts.edge, key);
    if (edge === false) return { allowed: false, remaining: 0, limit, resetSec, store: "edge", keyHash: keyHash(key) };
  }
  // Goal b8: every available store is consulted and the highest count wins. In
  // b6/b7 a durable answer that undercounted (a read that never saw the other
  // isolates' rows) returned early and the colo cache was never checked.
  let durable: number | null = null;
  if (durableStore) {
    try {
      durable = await durableStore.increment(storageKey, windowMs, now);
    } catch {
      durable = null;
    }
  }
  const cacheAvailable = sharedCache() != null;
  const shared = await readShared(storageKey);
  const merged = Math.max(count, durable ?? 0, (shared ?? 0) + 1);
  buckets.set(storageKey, merged);
  await writeShared(storageKey, merged);
  const store: RateLimitStore = durable != null ? "durable" : cacheAvailable ? "cache" : "memory";
  if (merged > limit) {
    return { allowed: false, remaining: 0, limit, resetSec, store, keyHash: keyHash(key) };
  }
  return { allowed: true, remaining: Math.max(0, limit - merged), limit, resetSec, store, keyHash: keyHash(key) };
}

/** Short non-reversible tag of the limiter key, so QA can see one IP maps to one bucket. */
export function keyHash(key: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** IETF RateLimit fields. Retry-After is set only when the caller is refusing the request. */
export function rateLimitHeaders(
  result: { limit: number; remaining: number; resetSec: number; store?: RateLimitStore; keyHash?: string },
  retry = false
): Record<string, string> {
  const headers: Record<string, string> = {
    "RateLimit-Limit": String(result.limit),
    "RateLimit-Remaining": String(result.remaining),
    "RateLimit-Reset": String(result.resetSec),
  };
  // Diagnostic only (no secrets): shows QA whether the shared counter answered.
  if (result.store) headers["X-RateLimit-Store"] = result.store;
  // Goal b8 CR-2: TT can watch the count decrement and see the (hashed) bucket.
  headers["X-RateLimit-Remaining"] = String(result.remaining);
  headers["X-RateLimit-Limit"] = String(result.limit);
  if (result.keyHash) headers["X-RateLimit-Key"] = result.keyHash;
  if (retry) headers["Retry-After"] = String(result.resetSec);
  return headers;
}

/** A filled honeypot is a bot. Empty and missing values are people. */
export function honeypotFilled(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/** Per-address cap across every email (CR-5: 20 failed logins from one IP in 5 min must see 429). */
export const AUTH_IP_SIGN_IN_LIMIT = 15;
export type AuthRateLimitRule = { name: string; limit: number; ipLimit: number; windowMs: number; message: string };

/** Which sign-in area POST this is, and its limit. Null for every other auth call (session, sign-out). */
export function authRateLimitRule(pathname: string): AuthRateLimitRule | null {
  if (/\/sign-in\/(email|username)\/?$/.test(pathname)) {
    return {
      name: "sign-in",
      limit: AUTH_SIGN_IN_LIMIT,
      ipLimit: AUTH_IP_SIGN_IN_LIMIT,
      windowMs: AUTH_SIGN_IN_WINDOW_MS,
      message: "Too many sign-in attempts. Wait a few minutes, then try again.",
    };
  }
  if (/\/sign-up\/email\/?$/.test(pathname)) {
    return {
      name: "sign-up",
      limit: AUTH_SIGN_UP_LIMIT,
      ipLimit: AUTH_SIGN_UP_LIMIT,
      windowMs: AUTH_SIGN_UP_WINDOW_MS,
      message: "Too many sign-up attempts from this network. Try again later.",
    };
  }
  if (/\/(forget-password|request-password-reset|reset-password)\/?$/.test(pathname)) {
    return {
      name: "password-reset",
      limit: AUTH_RESET_LIMIT,
      ipLimit: AUTH_RESET_LIMIT * 2,
      windowMs: AUTH_RESET_WINDOW_MS,
      message: "Too many password reset requests. Wait 15 minutes, then try again.",
    };
  }
  return null;
}
