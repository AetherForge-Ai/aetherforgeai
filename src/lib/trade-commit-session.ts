/**
 * Confirmed paper trades (Review → Confirm, body `confirm: true`).
 * A session-refresh race must not drop the commit or retarget it at another book.
 */

export const TRADE_SESSION_MISMATCH =
  "This browser session changed. Sign in again before confirming the trade.";

/**
 * Holdings and ledger reads that paint the book after login.
 * Not the background price poll (`/api/stocks/refresh`).
 */
export function isPortfolioSessionRead(url: string, method?: string): boolean {
  const verb = (method || "GET").toUpperCase();
  if (verb !== "GET") return false;
  const path = url.split("?")[0];
  if (path.endsWith("/api/stocks/refresh")) return false;
  return (
    path === "/api/stocks" ||
    path.endsWith("/api/stocks") ||
    path === "/api/transactions" ||
    path.endsWith("/api/transactions") ||
    path === "/api/metals" ||
    path.endsWith("/api/metals")
  );
}

/** A 401/409 on the first book load is a session miss, not a portfolio outage. */
export function portfolioLoadFailure(ok: boolean, status?: number): "toast" | "silent" {
  if (ok) return "silent";
  if (status === 401 || status === 409) return "silent";
  return "toast";
}

/** True only for an explicit confirm. Unconfirmed bodies stay on the normal path. */
export function isConfirmedCommitBody(body: unknown): boolean {
  if (typeof body !== "string") return false;
  try {
    const parsed = JSON.parse(body) as { confirm?: unknown };
    return parsed?.confirm === true;
  } catch {
    return false;
  }
}

/**
 * After a confirmed commit gets 401: retry the same body once, or stop.
 * `tradeRefreshUsed` means this attempt already ran the single rotating refresh.
 * A different live user is never retried — that would sell the other paper book.
 */
export function confirmedCommit401Action(input: {
  alreadyRetried: boolean;
  tradeRefreshUsed: boolean;
  liveUserId: string | null;
  activeUserId: string | null;
}): "retry" | "mismatch" | "unauthorized" {
  if (input.alreadyRetried) return "unauthorized";
  if (input.liveUserId && input.activeUserId && input.liveUserId !== input.activeUserId) {
    return "mismatch";
  }
  if (input.liveUserId || !input.tradeRefreshUsed) return "retry";
  return "unauthorized";
}

/**
 * A failed session-row write must not come back as "no session".
 * better-auth deletes the cookie when update returns null, which is the
 * mid-confirm logout. The existing row keeps the browser signed in.
 */
export function sessionWriteResult<T>(model: string, updated: T | null, existing: T | null): T | null {
  if (updated) return updated;
  if (model === "session" && existing) return existing;
  return null;
}
