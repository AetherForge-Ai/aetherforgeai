/**
 * Dividend breakdown stored in the existing transaction.notes field.
 * Totalum has no columns for imputation credits, withholding, or DRP.
 * The prefix sits at the start of notes, the same way a DEX fill does.
 * The UI strips it. Money in the prefix is NZ$. FX is NZD per 1 unit of
 * the payment currency, at the payment date.
 *
 * pull-check:track-b-2-2026-10-11
 */

import {
  roundFxRate,
  roundMoney,
  type CurrencyCode,
} from "@/lib/currency";
import { TAX_INDICATIVE_LABEL } from "@/lib/tax-disclaimer";

export type { CurrencyCode };

export interface DividendParts {
  /** Gross dividend in NZ$. */
  grossNzd: number;
  /** NZ imputation credits in NZ$. Not cash. */
  imputationNzd: number;
  /** Withholding in NZ$. */
  withholdingNzd: number;
  /** DRP reinvestment in NZ$. Not paid out as cash. */
  drpNzd: number;
  /** NZD received for 1 unit of the payment currency. */
  fx: number;
  currency: CurrencyCode;
  grossNative: number;
  withholdingNative: number;
  drpNative: number;
  /** Gross minus withholding minus DRP, in NZ$. Imputation is not subtracted. */
  netCashNzd: number;
}

export interface DividendSourceRow {
  _id?: string;
  type?: string;
  ticker?: string | null;
  asset_name?: string | null;
  asset_type?: string | null;
  notes?: string | null;
  executed_at?: string | null;
  createdAt?: string | null;
  cash_nzd?: number | null;
  total?: number | null;
  currency?: string | null;
  fx_rate?: number | null;
}

export interface DividendView {
  id: string;
  when: string;
  ticker: string;
  assetName: string;
  assetType: string;
  /** Present only when the hidden prefix was stored. Missing figures stay null. */
  parts: DividendParts | null;
  /** Cash credited on the row. For a prefixed row this is net cash. */
  cashNzd: number;
}

const CURRENCIES = new Set<CurrencyCode>(["NZD", "AUD", "USD"]);

/**
 * NZD per 1 unit. A blank rate is not replaced with the baseline table.
 * A USD quote below 1 is the opposite direction and is flipped, matching the book.
 * An AUD quote below 1 is left as entered.
 */
export function paymentDateFx(currency: CurrencyCode, fx: number | null | undefined): number | null {
  if (currency === "NZD") return 1;
  const raw = Number(fx);
  if (!(raw > 0) || !Number.isFinite(raw)) return null;
  const directed = currency === "USD" && raw < 1 ? 1 / raw : raw;
  return roundFxRate(directed);
}

function nativeToNzd(amount: number, fx: number): number {
  return roundMoney(amount * fx);
}

export function buildDividendRecord(input: {
  grossNative: number;
  imputationNzd: number;
  withholdingNative: number;
  drpNative: number;
  currency: CurrencyCode;
  fx: number;
}): { ok: true; parts: DividendParts } | { ok: false; message: string } {
  const currency = input.currency;
  const fx = paymentDateFx(currency, input.fx);
  if (fx == null) return { ok: false, message: "Enter the NZD exchange rate for the payment date." };
  const grossNative = roundMoney(Number(input.grossNative));
  const imputationNzd = roundMoney(Number(input.imputationNzd) || 0);
  const withholdingNative = roundMoney(Number(input.withholdingNative) || 0);
  const drpNative = roundMoney(Number(input.drpNative) || 0);
  if (!(grossNative > 0)) return { ok: false, message: "Gross dividend must be greater than zero." };
  if (imputationNzd < 0 || withholdingNative < 0 || drpNative < 0) {
    return { ok: false, message: "Imputation credits, withholding and DRP cannot be negative." };
  }
  if (withholdingNative + drpNative > grossNative + 0.001) {
    return { ok: false, message: "Withholding and DRP together are more than the gross dividend." };
  }
  const grossNzd = nativeToNzd(grossNative, fx);
  const withholdingNzd = nativeToNzd(withholdingNative, fx);
  const drpNzd = nativeToNzd(drpNative, fx);
  let netCashNzd = roundMoney(grossNzd - withholdingNzd - drpNzd);
  if (netCashNzd < 0) netCashNzd = 0;
  return {
    ok: true,
    parts: {
      grossNzd,
      imputationNzd,
      withholdingNzd,
      drpNzd,
      fx,
      currency,
      grossNative,
      withholdingNative,
      drpNative,
      netCashNzd,
    },
  };
}

function money(value: number): string {
  return roundMoney(value).toFixed(2);
}

function fxText(value: number): string {
  return roundFxRate(value).toFixed(4);
}

export function dividendNotesPrefix(parts: DividendParts): string {
  return (
    `[DIV:g=${money(parts.grossNzd)};i=${money(parts.imputationNzd)};w=${money(parts.withholdingNzd)};` +
    `d=${money(parts.drpNzd)};fx=${fxText(parts.fx)};ccy=${parts.currency};` +
    `ng=${money(parts.grossNative)};nw=${money(parts.withholdingNative)};nd=${money(parts.drpNative)}]`
  );
}

export function parseDividendNotes(notes?: string | null): DividendParts | null {
  const match = String(notes || "").match(/^\[DIV:([^\]]*)\]/);
  if (!match) return null;
  const bag = new Map<string, string>();
  for (const piece of match[1].split(";")) {
    const eq = piece.indexOf("=");
    if (eq <= 0) continue;
    bag.set(piece.slice(0, eq).trim(), piece.slice(eq + 1).trim());
  }
  const currency = bag.get("ccy") as CurrencyCode | undefined;
  if (!currency || !CURRENCIES.has(currency)) return null;
  const read = (key: string): number | null => {
    const raw = bag.get(key);
    if (raw == null || raw === "") return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  };
  const grossNzd = read("g");
  const imputationNzd = read("i");
  const withholdingNzd = read("w");
  const drpNzd = read("d");
  const fx = read("fx");
  const grossNative = read("ng");
  const withholdingNative = read("nw");
  const drpNative = read("nd");
  if (
    grossNzd == null ||
    imputationNzd == null ||
    withholdingNzd == null ||
    drpNzd == null ||
    fx == null ||
    grossNative == null ||
    withholdingNative == null ||
    drpNative == null
  ) {
    return null;
  }
  const netCashNzd = roundMoney(roundMoney(grossNzd) - roundMoney(withholdingNzd) - roundMoney(drpNzd));
  return {
    grossNzd: roundMoney(grossNzd),
    imputationNzd: roundMoney(imputationNzd),
    withholdingNzd: roundMoney(withholdingNzd),
    drpNzd: roundMoney(drpNzd),
    fx: roundFxRate(fx),
    currency,
    grossNative: roundMoney(grossNative),
    withholdingNative: roundMoney(withholdingNative),
    drpNative: roundMoney(drpNative),
    netCashNzd: netCashNzd < 0 ? 0 : netCashNzd,
  };
}

export function stripDividendNotesPrefix(notes?: string | null): string {
  const raw = notes || "";
  const match = raw.match(/^\[DIV:[^\]]*\]\s*/);
  return match ? raw.slice(match[0].length) : raw;
}

export function withDividendNotes(notes: string | null | undefined, parts: DividendParts): string {
  const body = stripDividendNotesPrefix(notes).trim().slice(0, 400);
  const prefix = dividendNotesPrefix(parts);
  return body ? `${prefix} ${body}` : prefix;
}

function cashOf(row: DividendSourceRow): number {
  if (typeof row.cash_nzd === "number" && Number.isFinite(row.cash_nzd)) return roundMoney(row.cash_nzd);
  if (typeof row.total === "number" && Number.isFinite(row.total)) return roundMoney(row.total);
  return 0;
}

export function dividendViewFromRow(row: DividendSourceRow): DividendView {
  return {
    id: String(row._id || ""),
    when: String(row.executed_at || row.createdAt || ""),
    ticker: String(row.ticker || "").trim(),
    assetName: String(row.asset_name || "").trim(),
    assetType: String(row.asset_type || "").trim(),
    parts: parseDividendNotes(row.notes),
    cashNzd: cashOf(row),
  };
}

export interface DividendTotals {
  /** Rows that stored the breakdown. */
  counted: number;
  grossNzd: number;
  imputationNzd: number;
  withholdingNzd: number;
  drpNzd: number;
  netCashNzd: number;
  /** Cash on older rows that have no breakdown. Not treated as gross. */
  legacyCashNzd: number;
  legacyCount: number;
}

export function summariseDividends(rows: readonly DividendView[]): DividendTotals {
  const totals: DividendTotals = {
    counted: 0,
    grossNzd: 0,
    imputationNzd: 0,
    withholdingNzd: 0,
    drpNzd: 0,
    netCashNzd: 0,
    legacyCashNzd: 0,
    legacyCount: 0,
  };
  for (const row of rows) {
    if (!row.parts) {
      totals.legacyCount += 1;
      totals.legacyCashNzd = roundMoney(totals.legacyCashNzd + row.cashNzd);
      continue;
    }
    totals.counted += 1;
    totals.grossNzd = roundMoney(totals.grossNzd + row.parts.grossNzd);
    totals.imputationNzd = roundMoney(totals.imputationNzd + row.parts.imputationNzd);
    totals.withholdingNzd = roundMoney(totals.withholdingNzd + row.parts.withholdingNzd);
    totals.drpNzd = roundMoney(totals.drpNzd + row.parts.drpNzd);
    totals.netCashNzd = roundMoney(totals.netCashNzd + row.parts.netCashNzd);
  }
  return totals;
}

export const DIVIDEND_CSV_COLUMNS = [
  "Payment date",
  "Holding",
  "Asset type",
  "Currency",
  "FX",
  "Gross NZD",
  "Imputation credits NZD",
  "Withholding NZD",
  "DRP reinvestment NZD",
  "Net cash NZD",
  "Breakdown",
  "Label",
] as const;

function csvEscape(value: unknown): string {
  const s = value == null ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Blank when the figure was not stored. A stored zero stays 0.00. */
function csvMoneyCell(value: number | null): string {
  if (value == null) return "";
  return roundMoney(value).toFixed(2);
}

export function dividendCsv(rows: readonly DividendView[], formatDate: (value: string) => string): string {
  const lines = [DIVIDEND_CSV_COLUMNS.join(",")];
  for (const row of rows) {
    const parts = row.parts;
    const cells = [
      formatDate(row.when),
      row.ticker,
      row.assetType,
      parts?.currency || "",
      parts ? fxText(parts.fx) : "",
      csvMoneyCell(parts ? parts.grossNzd : null),
      csvMoneyCell(parts ? parts.imputationNzd : null),
      csvMoneyCell(parts ? parts.withholdingNzd : null),
      csvMoneyCell(parts ? parts.drpNzd : null),
      csvMoneyCell(parts ? parts.netCashNzd : row.cashNzd),
      parts ? "" : "cash, no breakdown",
      TAX_INDICATIVE_LABEL,
    ];
    lines.push(cells.map(csvEscape).join(","));
  }
  const totals = summariseDividends(rows);
  lines.push(
    [
      "",
      "",
      "",
      "",
      "",
      csvMoneyCell(totals.grossNzd),
      csvMoneyCell(totals.imputationNzd),
      csvMoneyCell(totals.withholdingNzd),
      csvMoneyCell(totals.drpNzd),
      csvMoneyCell(roundMoney(totals.netCashNzd + totals.legacyCashNzd)),
      totals.legacyCount > 0 ? "cash, no breakdown" : "",
      TAX_INDICATIVE_LABEL,
    ]
      .map(csvEscape)
      .join(",")
  );
  return lines.join("\n");
}
