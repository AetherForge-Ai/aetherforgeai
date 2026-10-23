import { formatDisplayDateTime } from "@/lib/currency";

/** A provider timestamp older than this is shown as unavailable. Not an uptime claim. */
export const STATUS_STALE_MS = 7 * 24 * 60 * 60 * 1000;

/** NZ daylight time runs from the last Sunday in September to the first Sunday in April. */
export function nzZoneAbbr(date: Date): "NZDT" | "NZST" {
  const offset = new Intl.DateTimeFormat("en-NZ", { timeZone: "Pacific/Auckland", timeZoneName: "longOffset" })
    .formatToParts(date)
    .find((part) => part.type === "timeZoneName")?.value;
  return offset === "GMT+13:00" ? "NZDT" : "NZST";
}

/** M-2: a /status time in NZ time with the zone, e.g. "22 Oct 2026, 9:18 am NZDT". */
export function formatStatusTime(input?: string | Date | null): string {
  const base = formatDisplayDateTime(input);
  if (base === "—" || input == null || input === "") return "—";
  return `${base} ${nzZoneAbbr(input instanceof Date ? input : new Date(input))}`;
}

/** M-2 P2: the equity row from a saved quote time, in the same format as the other rows. */
export function statusSavedLabel(at: string, now = Date.now()): string {
  void now;
  return `${formatStatusTime(at)} · saved quote time`;
}

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
  const stamp = usable ? formatStatusTime(input.at) : "";

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
  if (feed.label === "Crypto list last attempt") return `Last attempt ${feed.text}`;
  if (feed.tone === "ok" || feed.text.endsWith("· saved quote time")) return `Last OK ${feed.text}`;
  return `Last print ${feed.text}`;
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


/**
 * b34 M-2 (Chief ruling): honest label for the saved equity snapshot time — never implies live.
 * "Prices last updated 6:32 am NZDT" today, "Prices last updated 6:32 am NZDT, 13 Oct" otherwise (NZST in winter).
 */
export function savedSnapshotLabel(at: string, now = Date.now()): string {
  const d = new Date(at);
  const tz = "Pacific/Auckland";
  const time = new Intl.DateTimeFormat("en-NZ", { timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true }).format(d).replace(/\s+/g, " ").toLowerCase();
  const day = (x: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(x);
  const sameDay = day(d) === day(new Date(now));
  const date = new Intl.DateTimeFormat("en-NZ", { timeZone: tz, day: "numeric", month: "short" }).format(d);
  // b58 P3 (TT): the real zone label for that moment, NZDT in summer and NZST in winter (was a fixed "NZT").
  const zone =
    new Intl.DateTimeFormat("en-NZ", { timeZone: tz, timeZoneName: "short" }).formatToParts(d).find((p) => p.type === "timeZoneName")?.value || "NZ time";
  return `Prices last updated ${time} ${zone}${sameDay ? "" : `, ${date}`}`;
}

/** b62 TT P2: /status DEX row label. */
export const DEX_STATUS_LABEL = "DEX tokens";
/** b62 TT P2: DEX list age bands (same as crypto quotes). */
export const DEX_STATUS_WINDOW = { amberMs: 15 * 60 * 1000, redMs: 60 * 60 * 1000 };

/**
 * b62 TT P2: the DEX row. "Last OK" is the saved DEX list's own time; a refresh that failed
 * after that time is named with its time and reason (this server's last attempt).
 */
export function dexStatusRow(
  at: string | null | undefined,
  failure: { at: string; reason: string } | null | undefined,
  now = Date.now()
): StatusFeedRow {
  const row = shapeStatusFeed({ label: DEX_STATUS_LABEL, at, now, ...DEX_STATUS_WINDOW });
  if (failure && (!at || Date.parse(failure.at) > Date.parse(at))) {
    const reason = failure.reason.replace(/\s+/g, " ").trim().slice(0, 160);
    return {
      ...row,
      tone: row.tone === "ok" ? "amber" : row.tone,
      text: `${row.text} · last refresh failed ${formatStatusTime(failure.at)}: ${reason}`,
    };
  }
  return row;
}
