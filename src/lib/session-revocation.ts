/**
 * b41 P1 (TT b40: sign-out could be cancelled). A signed-out session token is rejected everywhere,
 * even by an isolate whose session cache still holds it (SESSION_CACHE_FRESH_MS). The logout route
 * marks the token revoked in this isolate's memory and in the colo's Cache API, and readTokenSession
 * checks the marker before any cache hit. The token is stored only as a SHA-256 hash.
 */
export const REVOKED_TTL_S = 30 * 24 * 60 * 60;
const memRevoked = new Map<string, number>();

async function tokenHash(token: string): Promise<string> {
  const data = new TextEncoder().encode(`af-revoked:${token}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function edgeCache(): Cache | null {
  try {
    return (globalThis as unknown as { caches?: { default?: Cache } }).caches?.default ?? null;
  } catch {
    return null;
  }
}

const urlFor = (hash: string) => `https://af-internal.invalid/session-revoked/${hash}`;

export async function markSessionTokenRevoked(token: string | null | undefined): Promise<void> {
  if (!token) return;
  const hash = await tokenHash(token);
  memRevoked.set(hash, Date.now());
  const cache = edgeCache();
  if (!cache) return;
  try {
    await cache.put(urlFor(hash), new Response("1", { headers: { "Cache-Control": `max-age=${REVOKED_TTL_S}` } }));
  } catch {
    /* best effort: the DB session row is deleted too */
  }
}

/** True when this token was signed out. Bounded: a slow cache read counts as "not revoked". */
export async function isSessionTokenRevoked(token: string | null | undefined, ms = 150): Promise<boolean> {
  if (!token) return false;
  const hash = await tokenHash(token);
  if (memRevoked.has(hash)) return true;
  const cache = edgeCache();
  if (!cache) return false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const hit = await Promise.race([
      cache.match(urlFor(hash)),
      new Promise<undefined>((r) => {
        timer = setTimeout(() => r(undefined), ms);
      }),
    ]);
    if (hit) memRevoked.set(hash, Date.now());
    return Boolean(hit);
  } catch {
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function resetSessionRevocationForTests() {
  memRevoked.clear();
}
