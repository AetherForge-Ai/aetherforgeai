/**
 * New Zealand income year for an individual: 1 April to 31 March.
 * The year is named by the 31 March it ends on.
 * 10 Oct 2026 is in the year ending 31 Mar 2027.
 *
 * pull-check:track-b-2-2026-10-11
 */

import { lotCivilDay } from "@/lib/executed-at";

export function aucklandCivilToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Pacific/Auckland",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Income year ending 31 March. Null when the day cannot be read. */
export function nzTaxYearEnding(value: string | null | undefined): number | null {
  const day = lotCivilDay(value, "");
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const date = Number(match[3]);
  if (month < 1 || month > 12 || date < 1 || date > 31) return null;
  return month >= 4 ? year + 1 : year;
}

export function nzTaxYearLabel(endingYear: number): string {
  return `1 Apr ${endingYear - 1} to 31 Mar ${endingYear}`;
}

export function inNzTaxYear(value: string | null | undefined, endingYear: number): boolean {
  return nzTaxYearEnding(value) === endingYear;
}

export function isNzTaxYearEnding(value: number): boolean {
  return Number.isInteger(value) && value >= 2000 && value <= 2100;
}
