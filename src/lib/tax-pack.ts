/**
 * Indicative tax pack exports.
 * PDF and CSV totals use the same cent figures as the working paper.
 * A missing exchange rate leaves the FIF total blank.
 * This is not an accountant sign-off.
 *
 * pull-check:batch2-2026-10-11 B2-4
 */

import { roundMoney } from "@/lib/currency";
import { parseDividendNotes, type DividendTotals } from "@/lib/dividend-ledger";
import type { FifPaper } from "@/lib/fif-working-paper";
import { fifThresholdSentence } from "@/lib/fif-working-paper";
import { TAX_INDICATIVE_LABEL } from "@/lib/tax-disclaimer";
import type { RealisedReport } from "@/lib/tax-realised";
import type { TaxableIncomeReport } from "@/lib/taxable-income";

export const TAX_PACK_NOTE = "This pack is not an accountant sign-off.";

export interface CompletenessRow {
  type?: string | null;
  ticker?: string | null;
  currency?: string | null;
  fx_rate?: number | null;
  notes?: string | null;
}

export interface SalesSummary {
  endingYear: number;
  label: string;
  otherCount: number;
  cryptoCount: number;
  otherRealisedNzd: number;
  cryptoRealisedNzd: number;
  combinedNzd: number;
  cryptoProceedsNzd: number | null;
  cryptoCostNzd: number | null;
}

export interface CryptoDisposal {
  date: string;
  ticker: string;
  quantity: number;
  proceedsNzd: number | null;
  costNzd: number | null;
  fifoNzd: number | null;
}

export interface CompletenessItem {
  code: "missing-fx" | "missing-gross";
  detail: string;
}

function csvEscape(value: unknown): string {
  const text = value == null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function money(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "";
  return roundMoney(value).toFixed(2);
}

export function cryptoDisposals(report: RealisedReport): CryptoDisposal[] {
  return report.crypto.map((line) => ({
    date: line.when,
    ticker: line.ticker,
    quantity: line.quantity,
    proceedsNzd: line.proceedsNzd,
    costNzd: line.lots.length ? roundMoney(line.lots.reduce((sum, lot) => sum + lot.costBasisNzd, 0)) : null,
    fifoNzd: line.realisedNzd,
  }));
}

export function salesSummary(report: RealisedReport): SalesSummary {
  const disposals = cryptoDisposals(report);
  const proceeds = disposals.every((row) => row.proceedsNzd != null)
    ? roundMoney(disposals.reduce((sum, row) => sum + (row.proceedsNzd || 0), 0))
    : null;
  const cost = disposals.every((row) => row.costNzd != null)
    ? roundMoney(disposals.reduce((sum, row) => sum + (row.costNzd || 0), 0))
    : null;
  return {
    endingYear: report.endingYear,
    label: report.label,
    otherCount: report.other.length,
    cryptoCount: report.crypto.length,
    otherRealisedNzd: report.otherTotalNzd,
    cryptoRealisedNzd: report.cryptoTotalNzd,
    combinedNzd: report.combinedNzd,
    cryptoProceedsNzd: proceeds,
    cryptoCostNzd: cost,
  };
}

export function cryptoDisposalCsv(report: RealisedReport, formatDate: (value: string) => string): string {
  const lines = [["Date", "Holding", "Quantity", "Proceeds NZD", "Cost NZD", "FIFO NZD", "Label"].join(",")];
  for (const row of cryptoDisposals(report)) {
    lines.push(
      [formatDate(row.date), row.ticker, row.quantity, money(row.proceedsNzd), money(row.costNzd), money(row.fifoNzd), TAX_INDICATIVE_LABEL]
        .map(csvEscape)
        .join(",")
    );
  }
  const summary = salesSummary(report);
  lines.push(
    ["", "", "total", money(summary.cryptoProceedsNzd), money(summary.cryptoCostNzd), money(summary.cryptoRealisedNzd), TAX_INDICATIVE_LABEL]
      .map(csvEscape)
      .join(",")
  );
  return lines.join("\n");
}

export function fifCsv(paper: FifPaper): string {
  const lines = [["Holding", "Class", "Cost NZD", "Opening NZD", "Closing NZD", "FDR NZD", "Comparative value NZD", "Label"].join(",")];
  for (const row of paper.attributing) {
    lines.push(
      [row.ticker, "attributable", money(row.costNzd), money(row.openingNzd), money(row.closingNzd), money(row.fdrNzd), money(row.cvNzd), TAX_INDICATIVE_LABEL]
        .map(csvEscape)
        .join(",")
    );
  }
  lines.push(
    ["", "peak-cost", money(paper.peakCostNzd), "", "", "", "", TAX_INDICATIVE_LABEL].map(csvEscape).join(",")
  );
  lines.push(["", "reason", fifThresholdSentence(paper), "", "", "", "", TAX_INDICATIVE_LABEL].map(csvEscape).join(","));
  return lines.join("\n");
}

/** Visible gaps. A missing FX rate is why the FIF total stays blank. */
export function taxCompleteness(rows: readonly CompletenessRow[]): CompletenessItem[] {
  const items: CompletenessItem[] = [];
  for (const row of rows) {
    const type = String(row.type || "").toLowerCase();
    const ticker = String(row.ticker || "").trim().toUpperCase() || "a holding";
    if (type === "buy" || type === "opening_balance") {
      const currency = String(row.currency || "NZD").toUpperCase();
      const fx = Number(row.fx_rate);
      if (currency !== "NZD" && !(fx > 0)) {
        items.push({ code: "missing-fx", detail: `Buys missing FX rate: ${ticker} has no stored exchange rate.` });
      }
    }
    if (type === "dividend" && !parseDividendNotes(row.notes)) {
      items.push({ code: "missing-gross", detail: `Dividends missing gross: ${ticker} has cash but no stored gross.` });
    }
  }
  return items;
}

function pdfEscape(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

/** One-page PDF. The indicative label is always the first line. */
export function taxPaperPdf(input: { title: string; taxYear: string; lines: readonly string[] }): string {
  const rows = [TAX_INDICATIVE_LABEL, TAX_PACK_NOTE, input.title, input.taxYear, ...input.lines].slice(0, 42);
  const commands = ["BT", "/F1 11 Tf", "48 760 Td"];
  rows.forEach((line, index) => {
    const clean = line.replace(/[^\x20-\x7E]/g, " ").slice(0, 110);
    if (index > 0) commands.push("0 -16 Td");
    commands.push(`(${pdfEscape(clean)}) Tj`);
  });
  commands.push("ET");
  const stream = commands.join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Count 1 /Kids [3 0 R] >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [0];
  objects.forEach((object, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefAt = body.length;
  body += `xref\n0 ${objects.length + 1}\n`;
  body += "0000000000 65535 f \n";
  for (const offset of offsets.slice(1)) {
    body += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF`;
  return body;
}

export function fifPaperLines(paper: FifPaper): string[] {
  return [
    `Peak cost NZD ${money(paper.peakCostNzd) || "not calculated"}`,
    fifThresholdSentence(paper),
    ...paper.assumptions,
  ];
}

export function realisedPaperLines(report: RealisedReport): string[] {
  const summary = salesSummary(report);
  return [
    `Other realised NZD ${money(summary.otherRealisedNzd)}`,
    `Crypto FIFO NZD ${money(summary.cryptoRealisedNzd)}`,
    `Combined NZD ${money(summary.combinedNzd)}`,
    `Crypto proceeds NZD ${money(summary.cryptoProceedsNzd) || "blank"}`,
    `Crypto cost NZD ${money(summary.cryptoCostNzd) || "blank"}`,
    ...report.assumptions,
  ];
}

export function incomePaperLines(report: TaxableIncomeReport): string[] {
  return [
    `Gross NZD ${money(report.grossNzd)}`,
    `Imputation NZD ${money(report.imputationNzd)}`,
    `Withholding NZD ${money(report.withholdingNzd)}`,
    `DRP NZD ${money(report.drpNzd)}`,
    `Stored realised NZD ${money(report.realisedNzd)}`,
  ];
}

export function dividendPaperLines(totals: DividendTotals): string[] {
  return [
    `Gross NZD ${money(totals.grossNzd)}`,
    `Net cash NZD ${money(totals.netCashNzd)}`,
    `Imputation NZD ${money(totals.imputationNzd)}`,
    `Withholding NZD ${money(totals.withholdingNzd)}`,
    `DRP NZD ${money(totals.drpNzd)}`,
  ];
}
