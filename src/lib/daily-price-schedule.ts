/**
 * Morning capture from 06:07 through 07:07 Pacific/Auckland, every 5 minutes.
 *
 * GitHub cron is UTC and does not follow DST. NZDT is UTC+13 and NZST is UTC+12,
 * so each Auckland slot is scheduled twice. The route keeps only the fires whose
 * Pacific/Auckland clock is inside this window.
 */

import type { Exchange } from "@/lib/market-intel";

export const AUCKLAND_ZONE = "Pacific/Auckland";
export const CAPTURE_HOUR = 6;
export const CAPTURE_MINUTE = 7;

/** 06:07, 06:12, … 06:57, 07:02, 07:07. Thirteen fires, about one hour. */
export const CAPTURE_SLOTS: readonly { hour: number; minute: number }[] = Array.from({ length: 13 }, (_, index) => {
  const minutes = 6 * 60 + 7 + index * 5;
  return { hour: Math.floor(minutes / 60), minute: minutes % 60 };
});

/** NZDT 06:07–06:57. NZST at these UTC times is 05:07–05:57, outside the window. */
export const DAILY_PRICE_CRON_NZDT = "7,12,17,22,27,32,37,42,47,52,57 17 * * *";
/** NZDT 07:02–07:57 and NZST 06:02–06:57. The route drops the ones outside 06:07–07:07. */
export const DAILY_PRICE_CRON_UTC18 = "2,7,12,17,22,27,32,37,42,47,52,57 18 * * *";
/** NZST 07:02 and 07:07. NZDT at these UTC times is 08:02 and 08:07, outside the window. */
export const DAILY_PRICE_CRON_NZST = "2,7 19 * * *";
export const DAILY_PRICE_CRONS = [DAILY_PRICE_CRON_NZDT, DAILY_PRICE_CRON_UTC18, DAILY_PRICE_CRON_NZST] as const;

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

/** True from 06:07 through 07:07 inclusive in Auckland. */
export function isAucklandCaptureWindow(now: Date): boolean {
  const wall = aucklandWall(now);
  const minutes = wall.hour * 60 + wall.minute;
  return minutes >= 6 * 60 + 7 && minutes <= 7 * 60 + 7;
}

export function isAucklandCaptureSlot(wall: { hour: number; minute: number }): boolean {
  return CAPTURE_SLOTS.some((slot) => slot.hour === wall.hour && slot.minute === wall.minute);
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

/** Most recent scheduled morning slot at or before `now` (every 5 minutes, 06:07–07:07 Auckland). */
export function latestAucklandCapture(now: Date): Date | null {
  const t = now.getTime();
  let best: number | null = null;
  const anchor = new Date(t);
  const utcMinutes = [2, 7, 12, 17, 22, 27, 32, 37, 42, 47, 52, 57];
  for (let day = -2; day <= 1; day++) {
    for (const hour of [17, 18, 19]) {
      for (const minute of utcMinutes) {
        const utc = Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), anchor.getUTCDate() + day, hour, minute, 0, 0);
        if (utc > t) continue;
        if (!isAucklandCaptureSlot(aucklandWall(new Date(utc)))) continue;
        if (best == null || utc > best) best = utc;
      }
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
