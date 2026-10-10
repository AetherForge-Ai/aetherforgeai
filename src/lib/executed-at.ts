/**
 * A movement is either a real Auckland clock time or a civil date.
 * Date-only values and the old UTC-midnight / UTC-noon carriers must not
 * be printed as 1:00 pm or 1:00 am. Those clocks were never chosen.
 */

import { formatDisplayDate, formatDisplayDateTime } from "@/lib/currency";
import { aucklandDateISO } from "@/lib/fill-integrity";
import { movementCivilDay } from "@/lib/transaction-rules";

const DATE_ONLY = /^(\d{4}-\d{2}-\d{2})$/;
/** UTC midnight (1:00 pm NZDT) and UTC noon (1:00 am the next NZ day). */
const INVENTED_CLOCK = /^(\d{4}-\d{2}-\d{2})T(?:00:00:00(?:\.\d+)?|12:00:00(?:\.\d+)?)Z$/;

export interface ResolvedExecution {
  /** Persist this. A Date when the clock is real, otherwise yyyy-mm-dd. */
  stored: Date | string;
  /** Auckland civil day of the movement. */
  civilDay: string;
  /** False when the user supplied a date and no time. */
  hasClock: boolean;
  instant: Date;
}

export function isUnknownClock(value: string): boolean {
  const text = value.trim();
  return DATE_ONLY.test(text) || INVENTED_CLOCK.test(text);
}

/**
 * Today with no clock is the moment the row is saved.
 * A past date with no clock stays a date. A real timestamp is kept.
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
  if (civil) {
    if (civil === today) return { stored: now, civilDay: today, hasClock: true, instant: now };
    return { stored: civil, civilDay: civil, hasClock: false, instant: now };
  }
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
 * Auckland date, and the clock only when one was stored.
 * Unknown clocks return the civil date alone, for example "9 Oct 2026".
 */
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
  return movementCivilDay(text, fallback || text.slice(0, 10));
}

export function formatLedgerDateTime(input?: string | Date | null): string {
  if (input == null || input === "") return "";
  if (input instanceof Date) {
    const full = formatDisplayDateTime(input);
    return full === "—" ? "" : full;
  }
  const text = String(input).trim();
  if (DATE_ONLY.test(text) || INVENTED_CLOCK.test(text)) {
    const day = formatDisplayDate(text);
    return day === "—" ? "" : day;
  }
  const full = formatDisplayDateTime(text);
  return full === "—" ? "" : full;
}
