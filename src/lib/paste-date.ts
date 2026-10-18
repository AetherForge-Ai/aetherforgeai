import type { PastedRow } from "@/lib/paste-import";

/** b35 G-24: today's date in New Zealand, yyyy-mm-dd. */
export function nzToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Pacific/Auckland", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Rows with no date take the member's chosen date; rows with a date keep it. */
export function withDate(rows: readonly PastedRow[], date: string): PastedRow[] {
  return rows.map((r) => (r.date ? r : { ...r, date: date || null }));
}
