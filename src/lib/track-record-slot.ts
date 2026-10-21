/**
 * b53 G-20 / BS-01: slot-time idempotency for /api/cron/track-record. The track record runs every 6 h
 * (cron.yml at :23 UTC) and cron-fallback.yml may dispatch the same slot again. The slot key is the UTC
 * date plus the 6-hour block; a second scheduled run in a slot that already has a "schedule" entry in
 * the stored run log is a no-op.
 */
export const TRACK_SLOT_HOURS = 6;

export function trackSlotKey(at: Date | string | number): string {
  const d = new Date(at);
  const block = Math.floor(d.getUTCHours() / TRACK_SLOT_HOURS) * TRACK_SLOT_HOURS;
  return `${d.toISOString().slice(0, 10)}T${String(block).padStart(2, "0")}Z`;
}

export function slotAlreadyBuilt(log: readonly { at: string; builtBy?: string }[], now: Date | string | number): boolean {
  const key = trackSlotKey(now);
  return log.some((e) => e.builtBy === "schedule" && !Number.isNaN(Date.parse(e.at)) && trackSlotKey(e.at) === key);
}
