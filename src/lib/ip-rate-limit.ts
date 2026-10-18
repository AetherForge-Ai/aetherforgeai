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

/** Expand an IPv6 address to 8 hextets, or null when it is not IPv6. */
export function expandIpv6(raw: string): string[] | null {
  let ip = raw.trim().toLowerCase().replace(/^\[|\]$/g, "").split("%")[0];
  if (!ip.includes(":")) return null;
  // IPv4-mapped (::ffff:1.2.3.4) is treated as IPv4 by the caller.
  if (/^::ffff:\d+\.\d+\.\d+\.\d+$/.test(ip)) return null;
  const halves = ip.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
  const all = [...head, ...Array(Math.max(0, fill)).fill("0"), ...tail];
  if (all.length !== 8 || all.some((h) => !/^[0-9a-f]{1,4}$/.test(h))) return null;
  return all.map((h) => h.replace(/^0+(?=.)/, ""));
}

/**
 * Goal b11 CR-2/CR-5: the limiter key for an address. IPv4 is the full address;
 * IPv6 is its /64 prefix, so rotating addresses inside one /64 share a bucket.
 */
export function ipBucket(raw: string): string {
  const v6 = expandIpv6(raw);
  if (!v6) return raw.trim().replace(/^::ffff:/i, "");
  return `${v6.slice(0, 4).join(":")}::/64`;
}

/** Wider IPv6 bucket (/48) to catch rotation across /64s. IPv4 returns null. */
export function ipBucket48(raw: string): string | null {
  const v6 = expandIpv6(raw);
  return v6 ? `${v6.slice(0, 3).join(":")}::/48` : null;
}

/** /48 limit for the anonymous guide: 30 a minute across every /64 inside it. */
export const PERSONAL_GUIDE_LIMIT_48 = 12;
/** Per-email failed sign-in cap that ignores the address (CR-5). */
export const AUTH_EMAIL_LIMIT = 10;
export const AUTH_EMAIL_WINDOW_MS = 15 * 60 * 1000;

export function rateLimitIdentity(
  req: Request,
  nodeEnv = process.env.NODE_ENV
): { ok: true; ip: string } | { ok: false } {
  const cf = req.headers.get("cf-connecting-ip")?.trim() || "";
  if (cf) return { ok: true, ip: ipBucket(cf) };
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
  /** Goal b13 CR-2: which shared backends this server can reach, for QA on live. */
  backends?: string;
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
    return { allowed: false, remaining: 0, limit, resetSec, store: "memory", keyHash: keyHash(key), backends: `${lastBackends}; decided-by=memory` };
  }
  // b7: the Workers rate-limit binding is shared by every isolate at the edge.
  let edgeState = "not-used";
  if (opts.edge) {
    const edge = await edgeRateLimit(opts.edge, key);
    edgeState = edge === null ? "absent" : "present";
    if (edge === false) return { allowed: false, remaining: 0, limit, resetSec, store: "edge", keyHash: keyHash(key), backends: `edge-binding=present; ${lastBackends.replace(/^edge-binding=[^;]*; ?/, "")}; decided-by=edge` };
  }
  // Goal b8: every available store is consulted and the highest count wins. In
  // b6/b7 a durable answer that undercounted (a read that never saw the other
  // isolates' rows) returned early and the colo cache was never checked.
  let durable: number | null = null;
  if (durableStore) {
    try {
      durable = await durableStore.increment(storageKey, windowMs, now);
    } catch (err) {
      durable = null;
      const code = classifyTableError(err);
      // Goal b20 CR-2: carry the real (trimmed, redacted) error text with the code.
      lastTableState = code.startsWith("error:") && !code.includes("(") ? `${code}(detail=${tableErrorDetail(err)})` : code;
    }
  }
  const cacheAvailable = sharedCache() != null;
  const shared = await readShared(storageKey);
  const merged = Math.max(count, durable ?? 0, (shared ?? 0) + 1);
  buckets.set(storageKey, merged);
  await writeShared(storageKey, merged);
  const store: RateLimitStore = durable != null ? "durable" : cacheAvailable ? "cache" : "memory";
  const backends = `edge-binding=${edgeState}; table=${durableStore ? (durable != null ? "ok" : lastTableState) : "unregistered"}; cache-api=${cacheAvailable ? "yes" : "no"}; durable-object=absent`;
  lastBackends = backends;
  if (merged > limit) {
    return { allowed: false, remaining: 0, limit, resetSec, store, keyHash: keyHash(key), backends: `${backends}; decided-by=${store}` };
  }
  return { allowed: true, remaining: Math.max(0, limit - merged), limit, resetSec, store, keyHash: keyHash(key), backends };
}

/** Goal b12 CR-5: the sign-in email as one canonical form (trim, NFKC, lower case). */
export function normaliseLoginEmail(raw: unknown): string {
  return String(raw ?? "").normalize("NFKC").trim().toLowerCase().slice(0, 254);
}

/** SHA-256 hex, so a limiter key or log line never carries an address or email. */
export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
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
  result: { limit: number; remaining: number; resetSec: number; store?: RateLimitStore; keyHash?: string; backends?: string },
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
  if (result.backends) headers["X-RateLimit-Backends"] = result.backends;
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

/** Goal b14 CR-2: last backends line, so a 429 from the isolate floor still says what was reachable. */
let lastBackends = "edge-binding=unknown; table=unknown; cache-api=unknown; durable-object=absent";
let lastTableState = "error:unknown";

/**
 * Goal b14 CR-2: a safe code for why the rate_limit_counter table failed. Only a
 * fixed code leaves this function; never the raw message, keys or row data.
 */
export function classifyTableError(err: unknown): string {
  const msg = (err instanceof Error ? err.message : String(err ?? "")).toLowerCase();
  const status = Number((err as { status?: number; response?: { status?: number } } | null)?.status ?? (err as { response?: { status?: number } } | null)?.response?.status ?? 0);
  if (msg.includes("durable counter off")) return lastTableState;
  if (status === 401 || status === 403 || /unauthori|forbidden|permission|api key|apikey/.test(msg)) return "error:permission";
  if (status === 404 || /not found|does not exist|unknown (table|type)|no such table|table .*missing/.test(msg)) return "missing";
  const missing = /columns missing=([a-z_,]+)/.exec(msg);
  if (missing) return `error:columns(missing=${missing[1]})`;
  if (/filter on bucket_key returned nothing/.test(msg)) return "error:columns(filter-ignored)";
  if (/no rows|column|field|schema|validation|invalid property|unknown property/.test(msg)) return "error:columns";
  if (/timeout|deadline|timed out/.test(msg)) return "error:timeout";
  if (status) return `error:http-${status}`;
  return "error:other";
}

/**
 * Goal b20 CR-2: the table's own error text, trimmed and redacted so it can be
 * shown on /status: no URLs, emails, long tokens or digits runs that could be ids
 * or keys; at most 80 characters; separators that would break the status line removed.
 */
export function tableErrorDetail(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  const cleaned = raw
    .replace(/https?:\/\/\S+/gi, "<url>")
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "<email>")
    .replace(/\b(bearer|key|token|secret|password|apikey)\b\s*[:=]?\s*\S+/gi, "$1=<redacted>")
    .replace(/[A-Za-z0-9_\-]{20,}/g, "<redacted>")
    .replace(/[;()\n\r]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (cleaned || "empty").slice(0, 80);
}
