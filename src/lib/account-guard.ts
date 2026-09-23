/**
 * Pure account-ownership checks shared by API routes and the client apply-gate.
 * A payload is usable only when every echoed id matches the session user.
 * Missing owner ids are not treated as foreign (legacy rows); a present,
 * different id is.
 */

export const PRIVATE_NO_STORE_HEADERS: Record<string, string> = {
  "Cache-Control": "no-store, no-cache, must-revalidate, private",
  Vary: "Cookie",
};

/** Client-claimed user from `x-af-user-id`. Empty when the caller didn't send one. */
export function claimedUserId(req: { headers: { get(name: string): string | null } }): string | null {
  const raw = req.headers.get("x-af-user-id");
  const trimmed = raw?.trim();
  return trimmed ? trimmed : null;
}

/**
 * True when the browser says it is showing a different account than the
 * session cookie resolved to. Those responses must not carry ledger/cash.
 */
export function requestClaimsOtherUser(
  req: { headers: { get(name: string): string | null } },
  sessionUserId: string
): boolean {
  const claimed = claimedUserId(req);
  return !!claimed && claimed !== sessionUserId;
}

/** True when a loaded user record's own id disagrees with the session user. */
export function userRecordConflicts(
  sessionUserId: string,
  record: { _id?: unknown; id?: unknown } | null | undefined
): boolean {
  if (!record) return false;
  const rid = record._id ?? record.id;
  if (rid == null || rid === "") return false;
  return String(rid) !== String(sessionUserId);
}

/** True when any row carries an owner id for someone else. */
export function hasForeignOwner(rows: unknown, userId: string, field = "user"): boolean {
  if (!Array.isArray(rows) || !userId) return false;
  return rows.some((row) => {
    if (!row || typeof row !== "object") return false;
    const owner = (row as Record<string, unknown>)[field];
    if (owner == null || owner === "") return false;
    return String(owner) !== String(userId);
  });
}
