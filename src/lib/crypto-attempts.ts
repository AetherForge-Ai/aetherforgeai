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
// Goal b22 G-05: the shared write is kept so the request can wait for it; a bare
// `void` write died with the isolate and /status never saw an attempt.
let pendingPersist: Promise<void> = Promise.resolve();

/** Wait (bounded) for the last attempt to reach the shared store. */
export function flushCryptoAttempt(maxMs = 500): Promise<void> {
  return Promise.race([pendingPersist, new Promise<void>((r) => setTimeout(r, maxMs))]);
}

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
  const value = { last: lastAttempt, lastSuccess };
  pendingPersist = Promise.all([persistSharedAttempt(value), persistDurableAttempt(value)]).then(() => undefined);
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
  if (!cache) {
    console.log("[crypto-attempt] shared store: no Cache API here (local), kept in memory");
    return;
  }
  try {
    await cache.put(SHARED_KEY, new Response(JSON.stringify(value), { headers: { "content-type": "application/json", "cache-control": "max-age=86400" } }));
    console.log(`[crypto-attempt] shared store: saved ${value.last?.at ?? "-"} ${value.last?.ok ? "ok" : "failed"}`);
  } catch (err) {
    console.log(`[crypto-attempt] shared store: write failed ${err instanceof Error ? err.message.slice(0, 60) : "error"}`);
  }
}

/**
 * b28 G-05: the Cache API copy is per data centre and best effort, so /status saw an attempt on
 * 2 of 19 loads. The durable copy lives in one ownerless hidden watchlist row (AF-CAT), the same
 * store as the crypto snapshot, registered by crypto-snapshot.ts to avoid an import cycle.
 */
type DurableAttemptStore = { read(): Promise<string | null>; write(body: string): Promise<unknown> };
let durable: DurableAttemptStore | null = null;
export function registerDurableAttemptStore(store: DurableAttemptStore | null): void {
  durable = store;
}
async function persistDurableAttempt(value: SharedAttempt): Promise<void> {
  if (!durable) return;
  try {
    // Never replace a newer stored attempt with an older one.
    const prior = await readDurable(800);
    if (prior?.last && value.last && prior.last.at > value.last.at) return;
    await durable.write(JSON.stringify({ last: value.last, lastSuccess: value.lastSuccess ?? prior?.lastSuccess ?? null }));
  } catch (err) {
    console.log(`[crypto-attempt] durable store: write failed ${err instanceof Error ? err.message.slice(0, 60) : "error"}`);
  }
}
async function readDurable(maxMs: number): Promise<SharedAttempt | null> {
  if (!durable) return null;
  const raw = await Promise.race([durable.read().catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), maxMs))]);
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as SharedAttempt;
    return v && typeof v === "object" && (v.last == null || typeof v.last.at === "string") ? v : null;
  } catch {
    return null;
  }
}
function newest(...items: (SharedAttempt | null | undefined)[]): SharedAttempt | null {
  let best: SharedAttempt | null = null;
  for (const it of items) {
    if (!it?.last) continue;
    if (!best?.last || it.last.at > best.last.at) best = it;
  }
  return best;
}

export async function readSharedCryptoAttempt(): Promise<SharedAttempt & { scope: "shared" | "shared-colo" | "this-server" }> {
  const local = readCryptoAttempt();
  const stored = await readDurable(1500);
  if (stored?.last) {
    const best = newest(stored, local) ?? stored;
    return { ...best, scope: "shared" };
  }
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
