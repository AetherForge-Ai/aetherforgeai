/**
 * Goal b14 crypto staleness: every CoinGecko top-list attempt is recorded so a
 * silent fallback to the last-good snapshot is visible on /status. Only a time,
 * an outcome and a short status code are kept; never bodies or keys.
 */
export interface CryptoAttempt {
  at: string;
  ok: boolean;
  code: string;
}

let lastAttempt: CryptoAttempt | null = null;
let lastSuccess: string | null = null;

export function attemptCode(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  const status = msg.match(/CoinGecko (\d{3})/)?.[1];
  if (status) return `http-${status}`;
  if (/timeout|abort/i.test(msg)) return "timeout";
  if (/non-JSON/i.test(msg)) return "non-json";
  if (/unavailable/i.test(msg)) return "empty";
  return "error";
}

export function recordCryptoAttempt(ok: boolean, err?: unknown, now = Date.now()): CryptoAttempt {
  const at = new Date(now).toISOString();
  lastAttempt = { at, ok, code: ok ? "ok" : attemptCode(err) };
  if (ok) lastSuccess = at;
  console.log(`[crypto-attempt] ${lastAttempt.at} ${lastAttempt.ok ? "ok" : "failed"} ${lastAttempt.code}`);
  void persistSharedAttempt({ last: lastAttempt, lastSuccess });
  return lastAttempt;
}

export function readCryptoAttempt(): { last: CryptoAttempt | null; lastSuccess: string | null } {
  return { last: lastAttempt, lastSuccess };
}

/** G-05: crypto quote age bands. */
export const CRYPTO_AMBER_MS = 15 * 60 * 1000;
export const CRYPTO_RED_MS = 60 * 60 * 1000;

export function cryptoAgeBand(at: string | null | undefined, now = Date.now()): "ok" | "amber" | "red" | "unknown" {
  const t = at ? Date.parse(at) : NaN;
  if (!Number.isFinite(t)) return "unknown";
  const age = now - t;
  if (age > CRYPTO_RED_MS) return "red";
  if (age > CRYPTO_AMBER_MS) return "amber";
  return "ok";
}

/** Kill-feed switch: CRYPTO_FEED_OFF=on stops upstream calls and shows "—" with a reason. */
export function cryptoFeedKilled(env: Record<string, string | undefined> = process.env): boolean {
  return /^(1|on|true|yes)$/i.test(String(env.CRYPTO_FEED_OFF || "").trim());
}

/**
 * Goal b18: share the last attempt between Workers isolates through the Cloudflare
 * Cache API (shared per data centre). A store shared across every region needs a
 * Totalum table and is parked. Outside Workers this is a no-op.
 */
const SHARED_KEY = "https://aetherforge.internal/crypto-attempt-v1";
type SharedAttempt = { last: CryptoAttempt | null; lastSuccess: string | null };

function edgeCache(): Cache | null {
  const c = (globalThis as unknown as { caches?: { default?: Cache } }).caches;
  return c?.default ?? null;
}

async function persistSharedAttempt(value: SharedAttempt): Promise<void> {
  const cache = edgeCache();
  if (!cache) return;
  try {
    await cache.put(SHARED_KEY, new Response(JSON.stringify(value), { headers: { "content-type": "application/json", "cache-control": "max-age=86400" } }));
  } catch {
    /* best effort */
  }
}

export async function readSharedCryptoAttempt(): Promise<SharedAttempt & { scope: "shared-colo" | "this-server" }> {
  const local = readCryptoAttempt();
  const cache = edgeCache();
  if (cache) {
    try {
      const hit = await cache.match(SHARED_KEY);
      if (hit) {
        const shared = (await hit.json()) as SharedAttempt;
        const newer = !local.last || (shared.last && shared.last.at > local.last.at);
        return { ...(newer ? shared : local), scope: "shared-colo" };
      }
    } catch {
      /* fall through */
    }
  }
  return { ...local, scope: "this-server" };
}
