/**
 * Noon in Pacific/Auckland for a civil day, stored as an ISO instant.
 * Totalum date fields are datetimes (includeHour). A bare yyyy-mm-dd is not
 * a safe value for executed_at or purchase_date. Noon keeps the civil day:
 * the date prefix is that day, and the clock is not one the user chose.
 * NZST noon is UTC+12. NZDT noon is UTC+13. UTC noon is a different instant.
 */

const OFFSET_NOON = /^(\d{4}-\d{2}-\d{2})T12:00:00(?:\.0+)?\+1[23]:00$/;

function wallClock(date: Date): { year: string; month: string; day: string; hour: string; minute: string; second: string } | null {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Pacific/Auckland",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const read = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const year = read("year");
  const month = read("month");
  const day = read("day");
  const hour = read("hour");
  if (!year || !month || !day || !hour) return null;
  return { year, month, day, hour, minute: read("minute"), second: read("second") };
}

/** Civil day when this string is exactly noon in Auckland, otherwise null. */
export function aucklandNoonCivilDay(value: string): string | null {
  const text = value.trim();
  const offset = text.match(OFFSET_NOON);
  if (offset) {
    const parsed = new Date(text);
    if (Number.isNaN(parsed.getTime())) return null;
    const wall = wallClock(parsed);
    if (!wall || wall.hour !== "12" || wall.minute !== "00" || wall.second !== "00") return null;
    const day = `${wall.year}-${wall.month}-${wall.day}`;
    return day === offset[1] ? day : null;
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(text)) return null;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime()) || parsed.getUTCMilliseconds() !== 0) return null;
  const wall = wallClock(parsed);
  if (!wall || wall.hour !== "12" || wall.minute !== "00" || wall.second !== "00") return null;
  return `${wall.year}-${wall.month}-${wall.day}`;
}

/** ISO instant at 12:00 Pacific/Auckland on this yyyy-mm-dd. */
export function dateOnlyInstant(civilDay: string): string {
  const day = civilDay.slice(0, 10);
  for (const offset of ["+13:00", "+12:00"]) {
    const iso = `${day}T12:00:00${offset}`;
    if (aucklandNoonCivilDay(iso) === day) return iso;
  }
  return `${day}T12:00:00+12:00`;
}
