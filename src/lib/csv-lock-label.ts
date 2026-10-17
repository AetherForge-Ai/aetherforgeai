/** Visible Free-plan lock on every CSV export. pull-check:batch1-2026-10-11 B1-2 */
/** G-09 (goal b9): exact GOAL-LOCK wording. */
export const CSV_LOCK_LABEL = "CSV export: Starter and above";

/** Names the specific file (Dividends CSV, Income CSV) in the accessible name. */
export function csvLockAccessibleName(exportName?: string): string {
  const name = (exportName || "").trim();
  return name ? `${name}: ${CSV_LOCK_LABEL}` : CSV_LOCK_LABEL;
}
