/**
 * Ledger CSV cells. Money is 2 decimal places, FX is 4, unit prices keep
 * the stored precision (at least 6 decimal places before trailing zeros).
 */

import {
  formatDisplayDate,
  formatDisplayDateTime,
  formatSavedFx,
  roundMoney,
  roundUnitPrice,
  type CurrencyCode,
} from "@/lib/currency";
import { dexFromLedger, stripDexNotesPrefix } from "@/lib/dex-source";
import { collapseCorrectionNote, ensureCorrectionCurrency } from "@/lib/holding-correction";

export type CsvRow = Record<string, unknown> & {
  type?: string;
  ticker?: string;
  asset_name?: string;
  asset_type?: string;
  quantity?: number;
  price?: number;
  fees?: number;
  total?: number;
  realized_pnl?: number;
  currency?: string;
  notes?: string;
  executed_at?: string;
  createdAt?: string;
};

function num(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export function csvMoney(value: unknown): string {
  const n = num(value);
  if (n == null) return "";
  return roundMoney(n).toFixed(2);
}

/** Full stored precision. Trailing zeros are trimmed. Prices are not collapsed to 2 decimals. */
export function csvUnitPrice(value: unknown): string {
  const n = num(value);
  if (n == null) return "";
  const rounded = roundUnitPrice(n);
  return rounded.toFixed(12).replace(/(\.\d*?[1-9])0+$/, "$1").replace(/\.0+$/, "");
}

export function csvFeesNzd(row: CsvRow): string {
  const stored = num(row.fees_nzd);
  if (stored != null) return csvMoney(stored);
  const fees = num(row.fees_native ?? row.fees);
  if (fees == null) return csvMoney(0);
  const currency = String(row.fill_currency || row.currency || "NZD").toUpperCase();
  if (currency === "NZD") return csvMoney(fees);
  const fx = num(row.fx_rate);
  if (fx == null || !(fx > 0)) return "";
  return csvMoney(fees * fx);
}

export function csvFxSource(row: CsvRow): string {
  const stored = String(row.fx_source ?? "").trim();
  if (stored) return stored;
  const currency = String(row.fill_currency || row.currency || "NZD").toUpperCase();
  return currency === "NZD" ? "nzd" : "daily";
}

export function csvNotes(row: CsvRow): string {
  const raw = row.notes == null ? "" : String(row.notes);
  const currency = String(row.fill_currency || row.currency || "NZD").toUpperCase() as CurrencyCode;
  let notes = collapseCorrectionNote(stripDexNotesPrefix(raw)).trim();
  if (notes.startsWith("Correction:")) notes = ensureCorrectionCurrency(notes, currency);
  if (notes) return notes;
  if (row.type === "sell") return "Sell recorded on the paper book.";
  return "";
}

function csvText(value: unknown): string {
  return value == null ? "" : String(value);
}

function blank(value: unknown): boolean {
  return value == null || value === "";
}

export function transactionCsvCells(row: CsvRow): string[] {
  const when = csvText(row.executed_at || row.createdAt);
  const dex = dexFromLedger({
    venue: typeof row.venue === "string" ? row.venue : null,
    chain: typeof row.chain === "string" ? row.chain : null,
    notes: row.notes == null ? null : String(row.notes),
  });
  const currency = csvText(row.fill_currency || row.currency || "NZD");
  const notional =
    !blank(row.native_notional)
      ? csvMoney(row.native_notional)
      : !blank(row.quantity) && !blank(row.price)
        ? csvMoney(Number(row.quantity) * Number(row.price))
        : "";
  return [
    formatDisplayDate(when) === "—" ? "" : formatDisplayDate(when),
    formatDisplayDateTime(when) === "—" ? "" : formatDisplayDateTime(when),
    csvText(row.execution_status || "filled"),
    csvText(row.type),
    csvText(row.ticker),
    csvText(row.asset_name),
    csvText(row.asset_type),
    csvText(row.asset_id),
    blank(row.quantity) ? "" : csvText(row.quantity),
    csvUnitPrice(row.fill_price ?? row.price),
    currency,
    csvText(row.price_source || "user_fill"),
    csvText(row.price_as_at),
    blank(row.signal_price) ? "" : csvUnitPrice(row.signal_price),
    blank(row.mark_price) ? "" : csvUnitPrice(row.mark_price),
    csvMoney(row.fees_native ?? row.fees ?? 0),
    csvFeesNzd(row),
    notional,
    formatSavedFx(row.fx_rate),
    csvFxSource(row),
    csvMoney(row.cash_nzd ?? row.total),
    blank(row.realized_price_pnl_nzd) ? "" : csvMoney(row.realized_price_pnl_nzd),
    blank(row.realized_fx_pnl_nzd) ? "" : csvMoney(row.realized_fx_pnl_nzd),
    blank(row.realized_pnl_nzd) && blank(row.realized_pnl) ? "" : csvMoney(row.realized_pnl_nzd ?? row.realized_pnl),
    csvText(row.order_sizing || "units"),
    blank(row.notional_native) ? "" : csvMoney(row.notional_native),
    csvText(row.broker),
    csvNotes(row),
    dex.venue || "",
    dex.chain || "",
  ];
}

export function csvEscape(value: unknown): string {
  const s = value == null ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
