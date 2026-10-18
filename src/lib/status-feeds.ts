import { formatDisplayDateTime } from "@/lib/currency";

/** A provider timestamp older than this is shown as unavailable. Not an uptime claim. */
export const STATUS_STALE_MS = 7 * 24 * 60 * 60 * 1000;

export interface StatusFeedRow {
  label: string;
  tone: "ok" | "amber" | "red";
  text: string;
}

/** Words for an age threshold: "15 minutes", "1 hour", "4 days". */
export function freshnessWindowWords(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 120) return `${minutes} minutes`;
  const hours = Math.round(ms / 3_600_000);
  if (hours < 48) return hours === 1 ? "1 hour" : `${hours} hours`;
  const days = Math.round(ms / 86_400_000);
  return days === 1 ? "1 day" : `${days} days`;
}

/**
 * Freshness cell from a provider time and a failure flag.
 * A usable print past the amber window is amber. Past the red window, or a
 * failure with no usable print, is red. A missing time that is not a confirmed
 * failure stays amber ("unavailable") — this page does not invent an outage.
 */
export function shapeStatusFeed(input: {
  label: string;
  at: string | null | undefined;
  now?: number;
  amberMs: number;
  redMs: number;
  failed?: boolean;
  failedText?: string;
}): StatusFeedRow {
  const now = input.now ?? Date.now();
  const parsed = input.at ? Date.parse(input.at) : NaN;
  const age = Number.isFinite(parsed) ? now - parsed : null;
  const usable = age != null && age >= -60_000 && age <= STATUS_STALE_MS;
  const stamp = usable ? formatDisplayDateTime(input.at) : "";

  if (input.failed && usable && age! <= input.redMs) {
    const why = (input.failedText || "last refresh failed").replace(/^—\s*/, "");
    return { label: input.label, tone: "amber", text: `${stamp} · previous print kept; ${why}` };
  }
  if (input.failed) {
    return { label: input.label, tone: "red", text: input.failedText || "unavailable" };
  }
  if (!usable) {
    return {
      label: input.label,
      tone: age != null && age > STATUS_STALE_MS ? "red" : "amber",
      text: "unavailable",
    };
  }
  if (age! > input.redMs) {
    return {
      label: input.label,
      tone: "red",
      text: `${stamp} · older than ${freshnessWindowWords(input.redMs)}`,
    };
  }
  if (age! > input.amberMs) {
    return {
      label: input.label,
      tone: "amber",
      text: `${stamp} · older than ${freshnessWindowWords(input.amberMs)}`,
    };
  }
  return { label: input.label, tone: "ok", text: stamp === "—" ? "unavailable" : stamp };
}

/** Status-page sentence. A healthy feed still says "Last OK". A stale or failed feed does not. */
export function statusFeedBody(feed: StatusFeedRow): string {
  if (feed.text.startsWith("—") || feed.text === "unavailable") return feed.text;
  if (feed.label === "Crypto list last attempt") return `Last attempt ${feed.text} (NZ time)`;
  if (feed.tone === "ok") return `Last OK ${feed.text} (NZ time)`;
  return `Last print ${feed.text} (NZ time)`;
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
