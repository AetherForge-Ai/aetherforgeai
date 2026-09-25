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

export interface HeldQuantity {
  ticker: string;
  shares?: number | null;
}

/**
 * Read-time rule: an alert whose position is flat (no row, or quantity at
 * dust) is archived for display. The stored status is left alone — a later
 * admin pass may persist `archived`, but the page must not say Watching
 * before that runs. A missing holding counts as zero (a full sell deletes
 * the row).
 */
export function heldQuantityForTicker(holdings: HeldQuantity[], ticker: string): number {
  const sym = String(ticker || "").trim().toUpperCase();
  if (!sym) return 0;
  let total = 0;
  for (const holding of holdings) {
    if (String(holding.ticker || "").trim().toUpperCase() !== sym) continue;
    const shares = Number(holding.shares);
    if (shares > 0) total += shares;
  }
  return total;
}

export function alertIsEffectivelyArchived(
  status: string | null | undefined,
  heldQuantity: number
): boolean {
  if (String(status || "active").toLowerCase() === ARCHIVED_ALERT_STATUS) return true;
  return positionIsClosed(heldQuantity);
}

/** Alerts that should leave the Watching list. Already-archived rows are skipped. */
export function alertsHiddenForFlatPositions(
  alerts: AlertLifecycleRow[],
  holdings: HeldQuantity[]
): AlertLifecycleRow[] {
  return alerts.filter((alert) => {
    if (String(alert.status || "active").toLowerCase() === ARCHIVED_ALERT_STATUS) return false;
    return alertIsEffectivelyArchived(alert.status, heldQuantityForTicker(holdings, alert.ticker));
  });
}
