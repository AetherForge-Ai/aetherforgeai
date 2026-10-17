import { csvEscape } from "@/lib/csv-cell";
/**
 * Dividend breakdown stored in the existing transaction.notes field.
 * Totalum has no columns for imputation credits, withholding, or DRP.
 * The prefix sits at the start of notes, the same way a DEX fill does.
 * The UI strips it. Money in the prefix is NZ$. FX is NZD per 1 unit of
 * the payment currency, at the payment date.
 *
 * pull-check:track-b-2-2026-10-11
 * pull-check:batch2-2026-10-11 B2-3
 */

import {
  roundFxRate,
  roundMoney,
  type CurrencyCode,
} from "@/lib/currency";
import { lotCivilDay } from "@/lib/executed-at";
import { nzTaxYearEnding, nzTaxYearLabel } from "@/lib/nz-tax-year";
import { TAX_INDICATIVE_LABEL } from "@/lib/tax-disclaimer";

import { drpLotRow } from "@/lib/tax-scenarios";
import type { TaxLedgerRow } from "@/lib/taxable-income";
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
  /** Goal b8 G-01: shares allotted by the DRP. Absent on older rows. */
  drpShares?: number;
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
  drpShares?: number | null;
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
      ...(Number(input.drpShares) > 0 && drpNative > 0 ? { drpShares: Number(input.drpShares) } : {}),
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
    `ng=${money(parts.grossNative)};nw=${money(parts.withholdingNative)};nd=${money(parts.drpNative)}` +
    (parts.drpShares && parts.drpShares > 0 ? `;sh=${parts.drpShares}` : "") +
    "]"
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
    ...((read("sh") ?? 0) > 0 ? { drpShares: read("sh") as number } : {}),
  };
}

/**
 * Goal b8 G-01 / H-9: each DRP with shares allotted becomes a FIFO buy lot at
 * the DRP amount (native currency, payment-date FX). Rows without a share count
 * add no lot (nothing is guessed).
 */
export function drpLotsFromRows(rows: readonly DividendSourceRow[]): TaxLedgerRow[] {
  const lots: TaxLedgerRow[] = [];
  for (const row of rows) {
    if (row.type !== "dividend") continue;
    const parts = parseDividendNotes(row.notes);
    if (!parts?.drpShares || !(parts.drpShares > 0)) continue;
    lots.push(
      drpLotRow({
        id: `drp-${row._id || ""}`,
        ticker: String(row.ticker || "").trim().toUpperCase(),
        when: String(row.executed_at || row.createdAt || ""),
        shares: parts.drpShares,
        costNative: parts.drpNative,
        fx: parts.fx,
        currency: parts.currency,
        assetType: String(row.asset_type || "stock"),
      })
    );
  }
  return lots;
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
  return `${lines.join("\n")}\n`;
}

export interface MonthIncome {
  month: string;
  grossNzd: number;
  imputationNzd: number;
  withholdingNzd: number;
  drpNzd: number;
  netCashNzd: number;
}

export interface YearIncome {
  endingYear: number;
  label: string;
  grossNzd: number;
  imputationNzd: number;
  withholdingNzd: number;
  drpNzd: number;
  netCashNzd: number;
  /** Net cash plus DRP. Imputation credits are not included. */
  totalReturnNzd: number;
}

export interface ExpectedDividend {
  date: string;
  ticker: string;
  amountNzd: number | null;
}

export interface DividendIncome {
  months: MonthIncome[];
  years: YearIncome[];
  drp: DividendView[];
  cashNzd: number;
  totalReturnNzd: number;
  trailingGrossNzd: number;
  /** Trailing gross divided by cost. Null when cost was not supplied. */
  yieldOnCost: number | null;
  /** Trailing gross divided by value. Null when value was not supplied. */
  yieldOnValue: number | null;
}

function civilDay(value: string): string {
  const day = lotCivilDay(value, "");
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : "";
}

function shiftYears(iso: string, years: number): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]) + years, Number(match[2]) - 1, Number(match[3])));
  return date.toISOString().slice(0, 10);
}

/** A date the member typed. A blank date is refused. No calendar is consulted. */
export function expectedDividend(input: {
  date: string;
  ticker: string;
  amountNzd?: number | null;
}): ExpectedDividend | null {
  const date = civilDay(input.date);
  const ticker = input.ticker.trim().toUpperCase();
  if (!date || !ticker) return null;
  if (input.amountNzd == null) return { date, ticker, amountNzd: null };
  if (!Number.isFinite(input.amountNzd) || input.amountNzd < 0) return null;
  return { date, ticker, amountNzd: roundMoney(input.amountNzd) };
}

/**
 * Income by month and tax year, DRP lines, cash, and trailing yield.
 * Yield is omitted when cost or value is missing. Dates are not invented.
 */
export function dividendIncome(
  rows: readonly DividendView[],
  options?: { asOf?: string; costNzd?: number | null; valueNzd?: number | null }
): DividendIncome {
  const months = new Map<string, MonthIncome>();
  const years = new Map<number, YearIncome>();
  const drp: DividendView[] = [];
  let cashNzd = 0;
  let totalReturnNzd = 0;
  const asOf = options?.asOf && civilDay(options.asOf) ? civilDay(options.asOf) : "";
  const windowStart = asOf ? shiftYears(asOf, -1) : null;
  let trailingGrossNzd = 0;

  for (const row of rows) {
    const day = civilDay(row.when);
    const parts = row.parts;
    const net = parts ? parts.netCashNzd : row.cashNzd;
    cashNzd = roundMoney(cashNzd + net);
    const drpNzd = parts?.drpNzd || 0;
    totalReturnNzd = roundMoney(totalReturnNzd + net + drpNzd);
    if (parts && parts.drpNzd > 0) drp.push(row);
    if (!day || !parts) continue;

    const monthKey = day.slice(0, 7);
    const month = months.get(monthKey) || {
      month: monthKey,
      grossNzd: 0,
      imputationNzd: 0,
      withholdingNzd: 0,
      drpNzd: 0,
      netCashNzd: 0,
    };
    month.grossNzd = roundMoney(month.grossNzd + parts.grossNzd);
    month.imputationNzd = roundMoney(month.imputationNzd + parts.imputationNzd);
    month.withholdingNzd = roundMoney(month.withholdingNzd + parts.withholdingNzd);
    month.drpNzd = roundMoney(month.drpNzd + parts.drpNzd);
    month.netCashNzd = roundMoney(month.netCashNzd + parts.netCashNzd);
    months.set(monthKey, month);

    const ending = nzTaxYearEnding(day);
    if (ending != null) {
      const year = years.get(ending) || {
        endingYear: ending,
        label: nzTaxYearLabel(ending),
        grossNzd: 0,
        imputationNzd: 0,
        withholdingNzd: 0,
        drpNzd: 0,
        netCashNzd: 0,
        totalReturnNzd: 0,
      };
      year.grossNzd = roundMoney(year.grossNzd + parts.grossNzd);
      year.imputationNzd = roundMoney(year.imputationNzd + parts.imputationNzd);
      year.withholdingNzd = roundMoney(year.withholdingNzd + parts.withholdingNzd);
      year.drpNzd = roundMoney(year.drpNzd + parts.drpNzd);
      year.netCashNzd = roundMoney(year.netCashNzd + parts.netCashNzd);
      year.totalReturnNzd = roundMoney(year.netCashNzd + year.drpNzd);
      years.set(ending, year);
    }

    if (asOf && windowStart && day > windowStart && day <= asOf) {
      trailingGrossNzd = roundMoney(trailingGrossNzd + parts.grossNzd);
    }
  }

  const ratio = (base: number | null | undefined) => {
    if (base == null || !(base > 0)) return null;
    return trailingGrossNzd / base;
  };

  return {
    months: [...months.values()].sort((a, b) => a.month.localeCompare(b.month)),
    years: [...years.values()].sort((a, b) => a.endingYear - b.endingYear),
    drp,
    cashNzd,
    totalReturnNzd,
    trailingGrossNzd,
    yieldOnCost: ratio(options?.costNzd),
    yieldOnValue: ratio(options?.valueNzd),
  };
}

/** Same holding, same payment day and same gross (or cash) amount: probably a double entry. */
/**
 * b6 H-5: the payment day in NZ time. A stored row can be a full UTC timestamp
 * ("2026-10-13T11:00:00Z" is 14 Oct in Auckland), so slicing the string missed
 * the match and a duplicate saved with no warning.
 */
export function dividendDayKey(when: string | null | undefined): string {
  const raw = String(when || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const at = new Date(raw);
  if (!Number.isFinite(at.getTime())) return raw.slice(0, 10);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Pacific/Auckland",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

export function findDuplicateDividend(
  listed: readonly DividendView[],
  candidate: { ticker: string; when: string; grossNative?: number | null; cashNzd?: number | null }
): DividendView | null {
  const day = dividendDayKey(candidate.when);
  const bare = (t: string) => t.trim().toUpperCase().replace(/\.(NZ|NZX|AX|ASX)$/, "");
  const ticker = bare(candidate.ticker);
  const close = (a: number | null | undefined, b: number | null | undefined) =>
    typeof a === "number" && typeof b === "number" && Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < 0.005;
  return (
    listed.find(
      (row) =>
        bare(row.ticker) === ticker &&
        dividendDayKey(row.when) === day &&
        (close(row.parts?.grossNative, candidate.grossNative) ||
          close(row.cashNzd, candidate.cashNzd) ||
          close(row.cashNzd, candidate.grossNative) ||
          close(row.parts?.netCashNzd, candidate.cashNzd))
    ) || null
  );
}

/**
 * Server rows win, but a row saved in this session stays visible until the server list includes it,
 * so a refresh that returns a cached list does not hide a dividend that was just recorded.
 */
export function mergeDividendRows(server: readonly DividendView[], local: readonly DividendView[]): DividendView[] {
  const ids = new Set(server.map((row) => row.id).filter(Boolean));
  const pending = local.filter((row) => row.id && !ids.has(row.id));
  return [...pending, ...server];
}

/** A raw ledger row as /api/transactions returns it. */
export interface DividendTxLike {
  _id?: string;
  type?: string | null;
  ticker?: string | null;
  total?: number | null;
  price?: number | null;
  amount?: number | null;
  executed_at?: string | null;
  trade_date?: string | null;
}

export const DUPLICATE_DIVIDEND_CODE = "duplicate_dividend";

/**
 * b7 H-5: the same check on raw ledger rows, used by the Record panel at Review
 * and by POST /api/transactions at Confirm. Same holding (bare ticker), same NZ
 * payment day, and an amount within half a cent of the stored total or price.
 */
export function findDuplicateDividendTx<T extends DividendTxLike>(
  rows: readonly T[],
  candidate: { ticker: string; when: string; amounts: ReadonlyArray<number | null | undefined> }
): T | null {
  const bare = (t: string) => t.trim().toUpperCase().replace(/\.(NZ|NZX|AX|ASX)$/, "");
  const ticker = bare(candidate.ticker || "");
  const day = dividendDayKey(candidate.when);
  if (!ticker || !day) return null;
  const wanted = candidate.amounts.filter((a): a is number => typeof a === "number" && Number.isFinite(a) && a > 0);
  return (
    rows.find((row) => {
      if (String(row.type || "").toLowerCase() !== "dividend") return false;
      if (bare(String(row.ticker || "")) !== ticker) return false;
      if (dividendDayKey(row.trade_date || row.executed_at || "") !== day) return false;
      const stored = [row.total, row.price, row.amount]
        .map((v) => Math.abs(Number(v)))
        .filter((v) => Number.isFinite(v) && v > 0);
      return stored.some((s) => wanted.some((w) => Math.abs(s - w) < 0.005));
    }) || null
  );
}
