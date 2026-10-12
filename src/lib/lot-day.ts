/**
 * One civil day for a buy lot. The holding's earliest purchase date is not a lot date.
 * Prefer the row's NZ calendar date, then its trade clock, then executed_at.
 */

import { formatLedgerDateTime, isUnknownClock, lotCivilDay } from "@/lib/executed-at";

export const COST_METHOD_LABEL = "Cost method: FIFO (first in, first out).";

const DATE_ONLY = /^(\d{4}-\d{2}-\d{2})$/;

export interface LotDayRow {
  trade_date?: string | null;
  trade_datetime?: string | null;
  executed_at?: string | null;
  createdAt?: string | null;
}

/** yyyy-mm-dd Auckland day for this buy or sell. */
export function buyLotDay(row: LotDayRow): string {
  const tradeDate = String(row.trade_date ?? "").trim();
  if (DATE_ONLY.test(tradeDate)) return tradeDate;
  const tradeDt = String(row.trade_datetime ?? "").trim();
  if (tradeDt) {
    const day = lotCivilDay(tradeDt, "");
    if (day) return day;
  }
  return lotCivilDay(row.executed_at || row.createdAt, "");
}

/**
 * Ledger and CSV clock. A real clock on the lot day is kept.
 * A date-only movement stays date-only, even when an older executed_at carried a clock.
 */
export function ledgerDisplayWhen(row: LotDayRow): string {
  const tradeDt = String(row.trade_datetime ?? "").trim();
  if (tradeDt && !isUnknownClock(tradeDt)) return formatLedgerDateTime(tradeDt);
  const day = buyLotDay(row);
  const executed = String(row.executed_at || row.createdAt || "").trim();
  if (executed && !isUnknownClock(executed) && lotCivilDay(executed, "") === day) {
    return formatLedgerDateTime(executed);
  }
  if (!day) return formatLedgerDateTime(executed);
  return formatLedgerDateTime(day);
}

export function movementHasClock(shown: string): boolean {
  return shown.includes(":");
}

/** Tax CSV names: tax year plus the NZ export date. */
export function datedTaxCsvName(
  prefix: "realised-pl" | "taxable-income" | "dividend-ledger",
  endingYear: number | string,
  nzDate: string
): string {
  return `${prefix}-${endingYear}-${nzDate}.csv`;
}
