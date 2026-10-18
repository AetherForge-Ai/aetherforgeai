/**
 * b29 H-4/G-10: cross-isolate book-cache invalidation without a store read.
 *
 * b28 turned the per-isolate book cache off (BOOK_CACHE_MS=0) because a write on one isolate
 * could not clear another isolate's cache. That made every dashboard load re-read the whole
 * book (1.2 s → 6 s). Instead, the middleware stamps a write time on the browser that wrote
 * (cookie `af_bw`, server clock) on every book-changing request. Reads from that browser only
 * reuse a cache entry whose read *started* after that write time plus a margin covering the
 * write itself, so a reload can never be served the pre-write book.
 */
export const BOOK_WRITE_COOKIE = "af_bw";
/** A write request may still be committing when a read starts; entries must start after this margin. */
export const BOOK_WRITE_MARGIN_MS = 10_000;

const BOOK_WRITE_PATHS = [
  /^\/api\/transactions(\/|$)/,
  /^\/api\/stocks(\/|$)/,
  /^\/api\/import(\/|$)/,
  /^\/api\/tax\/fif(\/|$)/,
  /^\/api\/wealth(\/|$)/,
];

export function isBookWriteRequest(pathname: string, method: string): boolean {
  const m = method.toUpperCase();
  if (m === "GET" || m === "HEAD" || m === "OPTIONS") return false;
  return BOOK_WRITE_PATHS.some((re) => re.test(pathname));
}

/** Earliest read-start time a cached entry may have and still be served to this browser. */
export function bookNotBeforeFromCookie(cookieHeader: string | null | undefined): number {
  if (!cookieHeader) return 0;
  const match = cookieHeader.match(/(?:^|;\s*)af_bw=(\d{10,16})/);
  if (!match) return 0;
  const at = Number(match[1]);
  return Number.isFinite(at) ? at + BOOK_WRITE_MARGIN_MS : 0;
}
