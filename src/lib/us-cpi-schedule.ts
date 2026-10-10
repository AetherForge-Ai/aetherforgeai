/**
 * Published US CPI release days. October 2026 is the BLS date 14 Oct 2026.
 * 14 Oct 2026 08:30 America/New_York is 15 Oct 2026 01:30 in New Zealand.
 * The label stays the US release day so the catalyst and the news card match.
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const PUBLISHED_US_CPI: Record<string, string> = {
  "2026-10": "2026-10-14",
};

export function publishedUsCpiIso(year: number, monthIndex: number): string | null {
  const key = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
  return PUBLISHED_US_CPI[key] ?? null;
}

export function isPublishedUsCpiDay(isoDay: string): boolean {
  const day = isoDay.slice(0, 10);
  return Object.values(PUBLISHED_US_CPI).includes(day);
}

/** "14 Oct 2026 (US)" */
export function usCpiDateLabel(isoDay: string): string {
  const [year, month, day] = isoDay.slice(0, 10).split("-");
  const monthName = MONTHS[Number(month) - 1] || month;
  return `${Number(day)} ${monthName} ${year} (US)`;
}
