/**
 * Idempotent repair for ledger rows that booked USD/AUD cash with the
 * NZD→USD quote (a rate below 1) instead of NZD per 1 unit of foreign currency.
 *
 * Cash is stored on the row at trade time (`cash_nzd` / `total`) and on the
 * user as a running balance. Nothing here runs on page load — call
 * `applyLedgerFxCorrection` from the admin route only.
 */

import { audToNzd, usdToNzd } from "@/lib/currency";

export const FX_CORRECTION_MARK = "nzd-per-usd-v1";

export interface LedgerFxRow {
  _id: string;
  type?: string | null;
  currency?: string | null;
  fill_currency?: string | null;
  quantity?: number | null;
  price?: number | null;
  fees?: number | null;
  fees_native?: number | null;
  fees_nzd?: number | null;
  fx_rate?: number | null;
  cash_nzd?: number | null;
  total?: number | null;
  fx_direction_corrected?: string | null;
}

export interface FxCorrectionPlan {
  id: string;
  /** NZD per 1 unit of the trade currency, after un-inverting. */
  fxRate: number;
  cashNzd: number;
  feesNzd: number;
  /** Add this to the user's NZD cash balance (negative means a larger debit). */
  deltaCash: number;
  previousCashNzd: number;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function roundRate(n: number): number {
  return Math.round((n + Number.EPSILON) * 1e6) / 1e6;
}

function nativeToNzdAmount(amount: number, currency: "USD" | "AUD", storedRate: number): number {
  // Pass the stored rate through the named helper so a sub-1 quote is flipped.
  return currency === "USD" ? usdToNzd(amount, storedRate) : audToNzd(amount, storedRate);
}

/**
 * Plan a correction for one row, or null when the row is already in NZD-per-unit
 * direction (or isn't a foreign-currency fill). Safe to run twice: a row whose
 * cash already matches native × (rate flipped if needed) is skipped, and a row
 * stamped with FX_CORRECTION_MARK is skipped.
 */
export function planLedgerFxCorrection(row: LedgerFxRow): FxCorrectionPlan | null {
  if (row.fx_direction_corrected === FX_CORRECTION_MARK) return null;
  if (row.type !== "buy" && row.type !== "sell") return null;

  const currency = String(row.fill_currency || row.currency || "").toUpperCase();
  if (currency !== "USD" && currency !== "AUD") return null;

  const qty = Number(row.quantity) || 0;
  const price = Number(row.price) || 0;
  const fees = Math.max(0, Number(row.fees_native ?? row.fees) || 0);
  const native = row.type === "buy" ? qty * price + fees : qty * price - fees;
  if (!(qty > 0) || !(price > 0) || !(native > 0)) return null;

  const storedRate = Number(row.fx_rate);
  if (!(storedRate > 0) || !Number.isFinite(storedRate)) return null;

  const previous =
    row.cash_nzd != null && Number.isFinite(Number(row.cash_nzd))
      ? Number(row.cash_nzd)
      : row.total != null && Number.isFinite(Number(row.total))
        ? Number(row.total)
        : null;
  if (previous == null) return null;

  const correctedMag = round2(nativeToNzdAmount(native, currency, storedRate));
  const correctedCash = row.type === "buy" ? -correctedMag : correctedMag;
  const invertedRate = storedRate < 1 ? storedRate : 1 / storedRate;
  const invertedMag = round2(native * invertedRate);

  const near = (a: number, b: number) => Math.abs(a - b) <= Math.max(0.05, Math.abs(b) * 0.01);
  const matchesInverted = near(Math.abs(previous), invertedMag);
  const matchesCorrect = near(Math.abs(previous), correctedMag);
  // Already booked in the right direction.
  if (matchesCorrect || !matchesInverted) return null;
  if (Math.abs(correctedCash - previous) < 0.01) return null;

  const correctedRate = storedRate < 1 ? 1 / storedRate : storedRate;
  return {
    id: row._id,
    fxRate: roundRate(correctedRate),
    cashNzd: correctedCash,
    feesNzd: round2(nativeToNzdAmount(fees, currency, storedRate)),
    deltaCash: round2(correctedCash - previous),
    previousCashNzd: round2(previous),
  };
}

export function sumCorrectionDelta(plans: FxCorrectionPlan[]): number {
  return round2(plans.reduce((s, p) => s + p.deltaCash, 0));
}
