/**
 * Public post limit. No new database column.
 * The count is stored in the Cloudflare Cache API so a second Worker isolate
 * sees it. The in-memory Map is the backstop when that cache is missing.
 * The address is CF-Connecting-IP only. X-Forwarded-For is not read.
 */

export const PERSONAL_GUIDE_LIMIT = 10;
export const CONTACT_LIMIT = 5;
export const RATE_WINDOW_MS = 60 * 60 * 1000;
export const PUBLIC_INPUT_CAP = 2000;
export const NO_CF_IP = "no-cf-ip";
export const RATE_LIMIT_ADDRESS_REQUIRED = "A network address is required.";

type RateCache = {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
};

const buckets = new Map<string, number>();

export function resetRateLimits(): void {
  buckets.clear();
}

export function rateLimitIdentity(
  req: Request,
  nodeEnv = process.env.NODE_ENV
): { ok: true; ip: string } | { ok: false } {
  const cf = req.headers.get("cf-connecting-ip")?.trim() || "";
  if (cf) return { ok: true, ip: cf };
  if (nodeEnv === "production") return { ok: false };
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

export async function takeRateLimit(
  key: string,
  limit: number,
  windowMs = RATE_WINDOW_MS,
  now = Date.now()
): Promise<{ allowed: boolean; remaining: number }> {
  const storageKey = rateLimitStorageKey(key, windowMs, now);
  const shared = await readShared(storageKey);
  const count = Math.max(buckets.get(storageKey) ?? 0, shared ?? 0);
  if (count >= limit) {
    buckets.set(storageKey, count);
    return { allowed: false, remaining: 0 };
  }
  const next = count + 1;
  buckets.set(storageKey, next);
  await writeShared(storageKey, next);
  return { allowed: true, remaining: Math.max(0, limit - next) };
}

/** A filled honeypot is a bot. Empty and missing values are people. */
export function honeypotFilled(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}
