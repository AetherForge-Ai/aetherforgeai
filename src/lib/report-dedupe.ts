/**
 * A second Koins/Stox POST that lands just after a successful generate is the
 * duplicate that surfaces as a 429 even though the report is already on screen.
 * Treat anything inside this window as that follow-up, not a fresh allowance hit.
 */
export const REPORT_DUPLICATE_WINDOW_MS = 45_000;

export function isRecentReportDuplicate(previousIso: string | null | undefined, now = Date.now()): boolean {
  if (!previousIso) return false;
  const at = new Date(previousIso).getTime();
  if (!Number.isFinite(at)) return false;
  const age = now - at;
  return age >= 0 && age < REPORT_DUPLICATE_WINDOW_MS;
}
