/**
 * Short in-process cache for the signed-in book.
 * A trade clears that account's entries so the next read is fresh.
 */

const BOOK_CACHE_MS = 12_000;
const store = new Map<string, { at: number; value: unknown }>();

export function readBookCache<T>(key: string, ttlMs = BOOK_CACHE_MS): T | null {
  const hit = store.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > ttlMs) {
    store.delete(key);
    return null;
  }
  return hit.value as T;
}

export function writeBookCache(key: string, value: unknown): void {
  store.set(key, { at: Date.now(), value });
}

export function invalidateBookCache(userId: string): void {
  const prefix = `${userId}:`;
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}
