import "server-only";
import { headers } from "next/headers";
import { BOOK_CACHE_MS, readBookCache } from "@/lib/book-cache";
import { bookNotBeforeFromCookie } from "@/lib/book-write-mark";

/** b29: read the per-user book cache, skipping entries that started before this browser's last write. */
export async function readBookCacheForRequest<T>(key: string, ttlMs = BOOK_CACHE_MS): Promise<T | null> {
  let notBefore = 0;
  try {
    notBefore = bookNotBeforeFromCookie((await headers()).get("cookie"));
  } catch {
    // Outside a request (tests, cron): only the TTL and the epoch apply.
  }
  return readBookCache<T>(key, ttlMs, notBefore);
}
