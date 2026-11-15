/**
 * Daily capture at about 06:00 Pacific/Auckland.
 *
 * GitHub and Cloudflare cron strings are UTC and do not follow DST. New Zealand
 * standard time is UTC+12 and daylight time is UTC+13, so 06:07 Auckland is
 * 18:07 UTC the previous calendar day in NZST and 17:07 UTC the previous
 * calendar day in NZDT. Both fires are scheduled. The route runs only when the
 * Auckland hour is 6, which the IANA zone Pacific/Auckland decides.
 */

import type { Exchange } from "@/lib/market-intel";

export const AUCKLAND_ZONE = "Pacific/Auckland";
export const CAPTURE_HOUR = 6;
export const CAPTURE_MINUTE = 7;

/** 06:07 NZDT (UTC+13) → 17:07 UTC the previous calendar day. */
export const DAILY_PRICE_CRON_NZDT = "7 17 * * *";
/** 06:07 NZST (UTC+12) → 18:07 UTC the previous calendar day. */
export const DAILY_PRICE_CRON_NZST = "7 18 * * *";

export interface AucklandWall {
  iso: string;
  hour: number;
  minute: number;
  weekday: string;
}

export function aucklandWall(now: Date): AucklandWall {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: AUCKLAND_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const read = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    iso: `${read("year")}-${read("month")}-${read("day")}`,
    hour: Number(read("hour")),
    minute: Number(read("minute")),
    weekday: read("weekday"),
  };
}

/** True during the 6am hour in Auckland, including the :07 cron and a late run that is still in that hour. */
export function isAucklandCaptureWindow(now: Date): boolean {
  return aucklandWall(now).hour === CAPTURE_HOUR;
}

/**
 * UTC instant for a civil clock in Pacific/Auckland.
 * Tries both NZ offsets and keeps the candidate whose Auckland wall clock matches.
 */
export function utcForAuckland(year: number, month: number, day: number, hour: number, minute: number): Date | null {
  const iso = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  for (const offsetHours of [12, 13]) {
    const utc = new Date(Date.UTC(year, month - 1, day, hour - offsetHours, minute, 0, 0));
    const wall = aucklandWall(utc);
    if (wall.iso === iso && wall.hour === hour && wall.minute === minute) return utc;
  }
  return null;
}

/** Most recent 06:07 Pacific/Auckland at or before `now`. */
export function latestAucklandCapture(now: Date): Date | null {
  const t = now.getTime();
  let best: number | null = null;
  const anchor = new Date(t);
  for (let day = -2; day <= 1; day++) {
    for (const hour of [17, 18]) {
      const utc = Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), anchor.getUTCDate() + day, hour, CAPTURE_MINUTE, 0, 0);
      if (utc > t) continue;
      const wall = aucklandWall(new Date(utc));
      if (wall.hour === CAPTURE_HOUR && wall.minute === CAPTURE_MINUTE && (best == null || utc > best)) best = utc;
    }
  }
  return best == null ? null : new Date(best);
}

const SESSION_ZONE: Record<Exchange, string> = {
  NZX: "Pacific/Auckland",
  ASX: "Australia/Sydney",
  DOW: "America/New_York",
  NASDAQ: "America/New_York",
};

function civilWeekday(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, day)));
}

function shiftIso(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  utc.setUTCDate(utc.getUTCDate() + days);
  const y = utc.getUTCFullYear();
  const m = String(utc.getUTCMonth() + 1).padStart(2, "0");
  const d = String(utc.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function zonedNow(now: Date, timeZone: string): { iso: string; minutes: number; weekday: string } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const read = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    iso: `${read("year")}-${read("month")}-${read("day")}`,
    minutes: Number(read("hour")) * 60 + Number(read("minute")),
    weekday: read("weekday"),
  };
}

/**
 * Calendar date of the last session that has already closed.
 * Uses the same open/close hours as isExchangeRegularSession. A missing feed
 * for this date stays a gap. This date is not a price.
 */
export function lastCompletedSessionDate(market: Exchange, now: Date): string {
  const zone = SESSION_ZONE[market];
  const wall = zonedNow(now, zone);
  // After the cash close, today's session is the one to store. Before the open, it is the previous weekday.
  const afterClose =
    wall.weekday !== "Sat" &&
    wall.weekday !== "Sun" &&
    ((market === "NZX" && wall.minutes >= 16 * 60 + 45) ||
      (market === "ASX" && wall.minutes >= 16 * 60) ||
      ((market === "DOW" || market === "NASDAQ") && wall.minutes >= 16 * 60));
  let cursor = afterClose ? wall.iso : shiftIso(wall.iso, -1);
  for (let i = 0; i < 10; i++) {
    const weekday = civilWeekday(cursor);
    if (weekday !== "Sat" && weekday !== "Sun") return cursor;
    cursor = shiftIso(cursor, -1);
  }
  return cursor;
}

/** Completed session dates walking back from `now`, newest first. Holes are not filled. */
export function completedSessionDates(market: Exchange, now: Date, count: number): string[] {
  const dates: string[] = [];
  let cursor = lastCompletedSessionDate(market, now);
  dates.push(cursor);
  while (dates.length < count) {
    cursor = shiftIso(cursor, -1);
    const weekday = civilWeekday(cursor);
    if (weekday === "Sat" || weekday === "Sun") continue;
    dates.push(cursor);
  }
  return dates;
}
