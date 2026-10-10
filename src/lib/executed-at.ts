/**
 * A movement is either a real Auckland clock time or a civil date.
 * Date-only values and the old UTC-midnight / UTC-noon carriers must not
 * be printed as 1:00 pm or 1:00 am. Those clocks were never chosen.
 */

import { aucklandNoonCivilDay, dateOnlyInstant } from "@/lib/auckland-noon";
import { formatDisplayDate, formatDisplayDateTime } from "@/lib/currency";
import { aucklandDateISO } from "@/lib/fill-integrity";
import { movementCivilDay } from "@/lib/transaction-rules";

export { dateOnlyInstant };

const DATE_ONLY = /^(\d{4}-\d{2}-\d{2})$/;
/** UTC midnight (1:00 pm NZDT) and UTC noon (1:00 am the next NZ day). */
const INVENTED_CLOCK = /^(\d{4}-\d{2}-\d{2})T(?:00:00:00(?:\.\d+)?|12:00:00(?:\.\d+)?)Z$/;

export interface ResolvedExecution {
  /** Persist this. A Date when the clock is real. A past date with no clock is noon Auckland. */
  stored: Date | string;
  /** Auckland civil day of the movement. */
  civilDay: string;
  /** False when the user supplied a date and no time. */
  hasClock: boolean;
  instant: Date;
}

export function isUnknownClock(value: string): boolean {
  const text = value.trim();
  return DATE_ONLY.test(text) || INVENTED_CLOCK.test(text) || aucklandNoonCivilDay(text) != null;
}

function dateOnlyExecution(civil: string): ResolvedExecution {
  const stored = dateOnlyInstant(civil);
  return { stored, civilDay: civil, hasClock: false, instant: new Date(stored) };
}

/**
 * A date with no clock, including today, is noon Pacific/Auckland.
 * Storing "now" made a morning in Auckland keep the previous UTC day.
 * A real timestamp is kept.
 * pull-check:tax-fixups-2026-10-11
 */
export function resolveExecutedInstant(
  raw: string | Date | undefined | null,
  now: Date = new Date()
): ResolvedExecution {
  const today = aucklandDateISO(now);
  if (raw == null || raw === "") {
    return { stored: now, civilDay: today, hasClock: true, instant: now };
  }
  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) return { stored: now, civilDay: today, hasClock: true, instant: now };
    return resolveExecutedInstant(raw.toISOString(), now);
  }
  const text = String(raw).trim();
  const dateOnly = text.match(DATE_ONLY);
  const invented = text.match(INVENTED_CLOCK);
  const civil = dateOnly?.[1] || invented?.[1];
  if (civil) return dateOnlyExecution(civil);
  const noonDay = aucklandNoonCivilDay(text);
  if (noonDay) return dateOnlyExecution(noonDay);
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return { stored: now, civilDay: today, hasClock: true, instant: now };
  return {
    stored: parsed,
    civilDay: movementCivilDay(text, today),
    hasClock: true,
    instant: parsed,
  };
}

/**
 * Civil day for a lot. Date-only text and the old noon/midnight carriers
 * keep their yyyy-mm-dd prefix. A real timestamp uses the Auckland day.
 */
export function lotCivilDay(raw: string | Date | null | undefined, fallback = ""): string {
  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) return fallback;
    return lotCivilDay(raw.toISOString(), fallback);
  }
  const text = String(raw ?? "").trim();
  if (!text) return fallback;
  if (DATE_ONLY.test(text)) return text;
  const invented = text.match(INVENTED_CLOCK);
  if (invented) return invented[1];
  const noon = aucklandNoonCivilDay(text);
  if (noon) return noon;
  return movementCivilDay(text, fallback || text.slice(0, 10));
}

export function formatLedgerDateTime(input?: string | Date | null): string {
  if (input == null || input === "") return "";
  if (input instanceof Date) {
    return formatLedgerDateTime(input.toISOString());
  }
  const text = String(input).trim();
  const noon = aucklandNoonCivilDay(text);
  if (noon) {
    const day = formatDisplayDate(noon);
    return day === "—" ? "" : day;
  }
  if (DATE_ONLY.test(text) || INVENTED_CLOCK.test(text)) {
    const day = formatDisplayDate(text);
    return day === "—" ? "" : day;
  }
  const full = formatDisplayDateTime(text);
  return full === "—" ? "" : full;
}
