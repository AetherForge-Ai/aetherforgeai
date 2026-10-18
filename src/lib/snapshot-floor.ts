/**
 * b35 H-1 (GOAL-LOCK #25): version floor. The highest snapshot version a client has been served
 * rides back in a cookie (browsers) or an x-af-snapshot-floor header (scripts). A server whose copy
 * is older reads the store before answering, so a client never steps back.
 */
export const SNAPSHOT_FLOOR_COOKIE = "af_snap_v";
export const SNAPSHOT_FLOOR_HEADER = "x-af-snapshot-floor";

export function snapshotFloorFrom(req: Request): number {
  const header = Number(req.headers.get(SNAPSHOT_FLOOR_HEADER) || "");
  const m = (req.headers.get("cookie") || "").match(/(?:^|;\s*)af_snap_v=(\d{1,16})/);
  const cookie = m ? Number(m[1]) : 0;
  return Math.max(Number.isFinite(header) ? header : 0, Number.isFinite(cookie) ? cookie : 0);
}

export function snapshotFloorCookie(version: number): string {
  return `${SNAPSHOT_FLOOR_COOKIE}=${Math.max(0, Math.floor(version))}; Path=/; Max-Age=900; SameSite=Lax; Secure`;
}
