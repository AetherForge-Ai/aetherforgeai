/**
 * Short in-process cache for the signed-in book.
 * A trade clears that account's entries so the next read is fresh.
 *
 * A slow read can finish after the trade and write the pre-trade book back.
 * Callers capture bookCacheEpoch before the read and pass it to writeBookCache.
 * pull-check:batch1-2026-10-11 B1-3
 */

/**
 * b29 H-4/G-10: 15 s per-user reuse again (b28's 0 made /dashboard ~6 s). A write on another
 * isolate is covered by the `af_bw` write stamp (see book-write-mark.ts): a browser that wrote
 * never gets an entry whose read started before its write. `at` is the read START time.
 */
export const BOOK_CACHE_MS = 15_000;
const store = new Map<string, { at: number; value: unknown }>();
const epochs = new Map<string, number>();

export function bookCacheEpoch(userId: string): number {
  return epochs.get(userId) ?? 0;
}

export function readBookCache<T>(key: string, ttlMs = BOOK_CACHE_MS, notBefore = 0): T | null {
  if (!(ttlMs > 0)) return null;
  const hit = store.get(key);
  if (!hit) return null;
  if (notBefore > 0 && hit.at < notBefore) return null;
  if (Date.now() - hit.at > ttlMs) {
    store.delete(key);
    return null;
  }
  return hit.value as T;
}

/** Returns false when a trade invalidated this account while the read was in flight. */
export function writeBookCache(key: string, value: unknown, epoch?: number, readStartedAt?: number): boolean {
  const userId = key.split(":")[0] || "";
  if (epoch != null && epoch !== bookCacheEpoch(userId)) return false;
  store.set(key, { at: readStartedAt ?? Date.now(), value });
  return true;
}

const invalidateHooks: Array<(userId: string) => void> = [];
/** b30 G-10: book-version.server.ts bumps the durable per-user version here. */
export function onBookInvalidated(hook: (userId: string) => void): void {
  if (!invalidateHooks.includes(hook)) invalidateHooks.push(hook);
}

export function invalidateBookCache(userId: string): void {
  epochs.set(userId, bookCacheEpoch(userId) + 1);
  for (const hook of invalidateHooks) {
    try {
      hook(userId);
    } catch {
      /* the in-process invalidation above still applies */
    }
  }
  const prefix = `${userId}:`;
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

export function __resetBookCacheForTests(): void {
  store.clear();
  epochs.clear();
}
