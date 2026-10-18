/**
 * b37 G-10 (P1): helpers for the transaction write path.
 * - findIdempotentRow: the row a Confirm already wrote, found by its "idem=<key>" notes stamp, so a retry
 *   on another isolate (after a 401, a reload or a dropped connection) writes nothing new.
 * - writeMarkHeaders: stamps af_bwd when the write has *finished* (a separate cookie, so the order of
 *   Set-Cookie headers can't let the middleware's earlier af_bw win). The middleware stamps
 *   it when the request starts; a write that took longer than the 10 s margin could otherwise let a read that
 *   started mid-write be cached and served later as the pre-write book (a deleted row coming back).
 */
import { BOOK_WRITE_DONE_COOKIE } from "@/lib/book-write-mark";

export function findIdempotentRow<T extends { notes?: string | null }>(rows: readonly T[], key: string): T | null {
  const idem = String(key || "").trim().slice(0, 80);
  if (!idem) return null;
  const stamp = `idem=${idem}`;
  for (const row of rows) {
    const notes = String(row?.notes || "");
    const at = notes.indexOf(stamp);
    if (at === -1) continue;
    const end = notes.charAt(at + stamp.length);
    if (end === "" || end === " ") return row;
  }
  return null;
}

export function writeMarkHeaders(now = Date.now()): Record<string, string> {
  return {
    "Set-Cookie": `${BOOK_WRITE_DONE_COOKIE}=${now}; Path=/; Max-Age=3600; HttpOnly; Secure; SameSite=Lax`,
    "Cache-Control": "private, no-store",
  };
}
