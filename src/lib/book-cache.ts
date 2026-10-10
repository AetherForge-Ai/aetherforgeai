/**
 * Short in-process cache for the signed-in book.
 * A trade clears that account's entries so the next read is fresh.
 *
 * A slow read can finish after the trade and write the pre-trade book back.
 * Callers capture bookCacheEpoch before the read and pass it to writeBookCache.
 * pull-check:batch1-2026-10-11 B1-3
 */

const BOOK_CACHE_MS = 12_000;
const store = new Map<string, { at: number; value: unknown }>();
const epochs = new Map<string, number>();

export function bookCacheEpoch(userId: string): number {
  return epochs.get(userId) ?? 0;
}

export function readBookCache<T>(key: string, ttlMs = BOOK_CACHE_MS): T | null {
  const hit = store.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > ttlMs) {
    store.delete(key);
    return null;
  }
  return hit.value as T;
}

/** Returns false when a trade invalidated this account while the read was in flight. */
export function writeBookCache(key: string, value: unknown, epoch?: number): boolean {
  const userId = key.split(":")[0] || "";
  if (epoch != null && epoch !== bookCacheEpoch(userId)) return false;
  store.set(key, { at: Date.now(), value });
  return true;
}

export function invalidateBookCache(userId: string): void {
  epochs.set(userId, bookCacheEpoch(userId) + 1);
  const prefix = `${userId}:`;
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

export function __resetBookCacheForTests(): void {
  store.clear();
  epochs.clear();
}
