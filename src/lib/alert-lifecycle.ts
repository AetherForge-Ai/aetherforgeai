/**
 * When a position is fully sold, its price alerts must leave the active list.
 * Pure so the rule can be unit-tested without the database.
 */

export const ARCHIVED_ALERT_STATUS = "archived";

export interface AlertLifecycleRow {
  _id: string;
  ticker: string;
  status?: string | null;
}

/** True once the remaining quantity is dust (a full sell). */
export function positionIsClosed(remainingQuantity: number): boolean {
  return !(Number(remainingQuantity) > 1e-6);
}

/**
 * Alerts for this ticker that should be archived because the position is flat.
 * A partial sell (quantity still above zero) returns nothing. Already-archived
 * rows are not selected again, so the operation is idempotent.
 */
export function alertsToArchive(
  alerts: AlertLifecycleRow[],
  ticker: string,
  remainingQuantity: number
): AlertLifecycleRow[] {
  if (!positionIsClosed(remainingQuantity)) return [];
  const sym = String(ticker || "").trim().toUpperCase();
  if (!sym) return [];
  return alerts.filter((a) => {
    if (String(a.ticker || "").trim().toUpperCase() !== sym) return false;
    return String(a.status || "active").toLowerCase() !== ARCHIVED_ALERT_STATUS;
  });
}
