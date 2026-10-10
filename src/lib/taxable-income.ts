/**
 * Taxable-income summary for one 1 April–31 March year.
 * Dividend pieces come from the notes prefix. A row without that prefix
 * is cash only and is not treated as gross. Realised gains are the amount
 * stored on the sell. FIFO is a separate paper.
 *
 * pull-check:track-b-2-2026-10-11
 */

import { roundMoney } from "@/lib/currency";
import { dividendViewFromRow, type DividendSourceRow } from "@/lib/dividend-ledger";
import { inNzTaxYear, nzTaxYearEnding, nzTaxYearLabel } from "@/lib/nz-tax-year";
import { TAX_INDICATIVE_LABEL } from "@/lib/tax-disclaimer";

export interface TaxLedgerRow extends DividendSourceRow {
  quantity?: number | null;
  price?: number | null;
  fill_price?: number | null;
  fees?: number | null;
  fees_nzd?: number | null;
  realized_pnl?: number | null;
  realized_pnl_nzd?: number | null;
}

export interface DividendIncomeLine {
  when: string;
  ticker: string;
  assetType: string;
  grossNzd: number | null;
  imputationNzd: number | null;
  withholdingNzd: number | null;
  drpNzd: number | null;
  legacyCashNzd: number | null;
}

export interface RealisedIncomeLine {
  when: string;
  ticker: string;
  assetType: string;
  /** Null when the sell did not store a realised amount. Not counted as zero. */
  realisedNzd: number | null;
}

export interface TaxableIncomeReport {
  endingYear: number;
  label: string;
  dividends: DividendIncomeLine[];
  realised: RealisedIncomeLine[];
  grossNzd: number;
  imputationNzd: number;
  withholdingNzd: number;
  drpNzd: number;
  legacyCashNzd: number;
  legacyCount: number;
  realisedNzd: number;
  realisedMissing: number;
}

function whenOf(row: TaxLedgerRow): string {
  return String(row.executed_at || row.createdAt || "");
}

function realisedAmount(row: TaxLedgerRow): number | null {
  if (typeof row.realized_pnl_nzd === "number" && Number.isFinite(row.realized_pnl_nzd)) {
    return roundMoney(row.realized_pnl_nzd);
  }
  if (typeof row.realized_pnl === "number" && Number.isFinite(row.realized_pnl)) {
    return roundMoney(row.realized_pnl);
  }
  return null;
}

export function taxableIncome(rows: readonly TaxLedgerRow[], endingYear: number): TaxableIncomeReport {
  const dividends: DividendIncomeLine[] = [];
  const realised: RealisedIncomeLine[] = [];
  let grossNzd = 0;
  let imputationNzd = 0;
  let withholdingNzd = 0;
  let drpNzd = 0;
  let legacyCashNzd = 0;
  let legacyCount = 0;
  let realisedNzd = 0;
  let realisedMissing = 0;

  const ordered = [...rows].sort((a, b) => whenOf(a).localeCompare(whenOf(b)));
  for (const row of ordered) {
    const when = whenOf(row);
    if (!inNzTaxYear(when, endingYear)) continue;
    if (row.type === "dividend") {
      const view = dividendViewFromRow(row);
      if (!view.parts) {
        legacyCount += 1;
        legacyCashNzd = roundMoney(legacyCashNzd + view.cashNzd);
        dividends.push({
          when,
          ticker: view.ticker,
          assetType: view.assetType,
          grossNzd: null,
          imputationNzd: null,
          withholdingNzd: null,
          drpNzd: null,
          legacyCashNzd: view.cashNzd,
        });
        continue;
      }
      grossNzd = roundMoney(grossNzd + view.parts.grossNzd);
      imputationNzd = roundMoney(imputationNzd + view.parts.imputationNzd);
      withholdingNzd = roundMoney(withholdingNzd + view.parts.withholdingNzd);
      drpNzd = roundMoney(drpNzd + view.parts.drpNzd);
      dividends.push({
        when,
        ticker: view.ticker,
        assetType: view.assetType,
        grossNzd: view.parts.grossNzd,
        imputationNzd: view.parts.imputationNzd,
        withholdingNzd: view.parts.withholdingNzd,
        drpNzd: view.parts.drpNzd,
        legacyCashNzd: null,
      });
    }
    if (row.type === "sell") {
      const amount = realisedAmount(row);
      if (amount == null) realisedMissing += 1;
      else realisedNzd = roundMoney(realisedNzd + amount);
      realised.push({
        when,
        ticker: String(row.ticker || "").trim(),
        assetType: String(row.asset_type || "").trim(),
        realisedNzd: amount,
      });
    }
  }

  return {
    endingYear,
    label: nzTaxYearLabel(endingYear),
    dividends,
    realised,
    grossNzd,
    imputationNzd,
    withholdingNzd,
    drpNzd,
    legacyCashNzd,
    legacyCount,
    realisedNzd,
    realisedMissing,
  };
}

/** Ending years present on the book, plus the current income year. */
export function taxYearChoices(rows: readonly TaxLedgerRow[], today: string): number[] {
  const years = new Set<number>();
  const current = nzTaxYearEnding(today);
  if (current != null) years.add(current);
  for (const row of rows) {
    const ending = nzTaxYearEnding(row.executed_at || row.createdAt);
    if (ending != null) years.add(ending);
  }
  return [...years].sort((a, b) => b - a);
}

export const TAXABLE_INCOME_CSV_COLUMNS = [
  "Tax year",
  "Date",
  "Holding",
  "Kind",
  "Gross NZD",
  "Imputation credits NZD",
  "Withholding NZD",
  "DRP reinvestment NZD",
  "Cash without breakdown NZD",
  "Realised NZD",
  "Label",
] as const;

function csvEscape(value: unknown): string {
  const s = value == null ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function cellMoney(value: number | null): string {
  if (value == null) return "";
  return roundMoney(value).toFixed(2);
}

export function taxableIncomeCsv(report: TaxableIncomeReport, formatDate: (value: string) => string): string {
  const lines = [TAXABLE_INCOME_CSV_COLUMNS.join(",")];
  const push = (cells: unknown[]) => lines.push(cells.map(csvEscape).join(","));
  for (const row of report.dividends) {
    push([
      report.label,
      formatDate(row.when),
      row.ticker,
      row.legacyCashNzd != null ? "cash, no breakdown" : "dividend",
      cellMoney(row.grossNzd),
      cellMoney(row.imputationNzd),
      cellMoney(row.withholdingNzd),
      cellMoney(row.drpNzd),
      cellMoney(row.legacyCashNzd),
      "",
      TAX_INDICATIVE_LABEL,
    ]);
  }
  for (const row of report.realised) {
    push([
      report.label,
      formatDate(row.when),
      row.ticker,
      "realised",
      "",
      "",
      "",
      "",
      "",
      cellMoney(row.realisedNzd),
      TAX_INDICATIVE_LABEL,
    ]);
  }
  push([
    report.label,
    "",
    "",
    "total",
    cellMoney(report.grossNzd),
    cellMoney(report.imputationNzd),
    cellMoney(report.withholdingNzd),
    cellMoney(report.drpNzd),
    cellMoney(report.legacyCount > 0 ? report.legacyCashNzd : null),
    cellMoney(report.realisedNzd),
    TAX_INDICATIVE_LABEL,
  ]);
  return lines.join("\n");
}
