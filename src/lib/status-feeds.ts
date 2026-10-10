import { formatDisplayDateTime } from "@/lib/currency";

/** A provider timestamp older than this is shown as unavailable. Not an uptime claim. */
export const STATUS_STALE_MS = 7 * 24 * 60 * 60 * 1000;

export interface StatusFeedRow {
  label: string;
  tone: "ok" | "amber";
  text: string;
}

/**
 * Last provider time for a public feed. Missing, unparseable, or stale times
 * are "unavailable". The fetch clock is never substituted.
 * pull-check:batch1-2026-10-11 B1-7
 */
export function presentStatusFeed(
  label: string,
  at: string | null | undefined,
  now = Date.now()
): StatusFeedRow {
  const parsed = at ? Date.parse(at) : NaN;
  const fresh = Number.isFinite(parsed) && parsed <= now + 60_000 && now - parsed <= STATUS_STALE_MS;
  if (!fresh) return { label, tone: "amber", text: "unavailable" };
  return { label, tone: "ok", text: formatDisplayDateTime(at) };
}

export function latestIso(values: Array<string | null | undefined>): string | null {
  let best = Number.NEGATIVE_INFINITY;
  let iso: string | null = null;
  for (const value of values) {
    if (!value) continue;
    const time = Date.parse(value);
    if (Number.isFinite(time) && time > best) {
      best = time;
      iso = value;
    }
  }
  return iso;
}
