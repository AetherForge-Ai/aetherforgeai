import "server-only";
import { headers } from "next/headers";
import { BOOK_CACHE_MS, readBookCache } from "@/lib/book-cache";
import { bookNotBeforeFromCookie } from "@/lib/book-write-mark";
import { readBookVersionKnown } from "@/lib/book-version.server";

/** b29: read the per-user book cache, skipping entries that started before this browser's last write. */
export async function readBookCacheForRequest<T>(key: string, ttlMs = BOOK_CACHE_MS): Promise<T | null> {
  let notBefore = 0;
  try {
    notBefore = bookNotBeforeFromCookie((await headers()).get("cookie"));
  } catch {
    // Outside a request (tests, cron): only the TTL and the epoch apply.
  }
  // b30 G-10: a write on another device or isolate bumps the durable book version.
  const userId = key.split(":")[0] || "";
  if (userId && readBookCache<T>(key, ttlMs, notBefore) != null) {
    const version = await readBookVersionKnown(userId);
    // b37 G-10: an unreadable version means "maybe written elsewhere": skip the cache.
    if (!version) return null;
    notBefore = Math.max(notBefore, version.at);
  }
  return readBookCache<T>(key, ttlMs, notBefore);
}

/** b40 G-10: the newest write time this browser's write cookies name (0 outside a request). */
export async function requestWriteNotBefore(): Promise<number> {
  try {
    return bookNotBeforeFromCookie((await headers()).get("cookie"));
  } catch {
    return 0;
  }
}
