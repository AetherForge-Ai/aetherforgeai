import { moneyCell } from "@/lib/currency";
import { csvEscape } from "@/lib/csv-cell";
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
import { fifThresholdSentence, fifTotals } from "@/lib/fif-working-paper";
import { TAX_INDICATIVE_LABEL } from "@/lib/tax-disclaimer";
import type { RealisedReport } from "@/lib/tax-realised";
import type { TaxableIncomeReport } from "@/lib/taxable-income";
import { lotCivilDay } from "@/lib/executed-at";

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


function money(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "";
  return moneyCell(value); // b51 G-12: the one rule
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
    // G-31: the IR461 quick sale adjustment as its own line inside the FDR figure above.
    if (row.quickSaleNzd) {
      lines.push([row.ticker, "quick-sale adjustment (IR461, in FDR)", "", "", "", money(row.quickSaleNzd), "", TAX_INDICATIVE_LABEL].map(csvEscape).join(","));
    }
  }
  // Goal b10 G-12: the total row is the sum of the rounded rows above.
  const totals = fifTotals(paper.attributing);
  if (paper.attributing.length) {
    lines.push(["Total", "attributable", money(totals.costNzd), "", "", money(totals.fdrNzd), money(totals.cvNzd), TAX_INDICATIVE_LABEL].map(csvEscape).join(","));
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
/** Goal b8 H-9: the NZ income year spelled out, e.g. "Tax year 1 Apr 2025 to 31 Mar 2026". */
export function taxYearSpan(endingYear: number): string {
  return `Tax year 1 Apr ${endingYear - 1} to 31 Mar ${endingYear}`;
}

/**
 * b26 H-9: lines wrap at word boundaries inside the page margins (they were cut at the
 * right edge) and long packs run over several pages instead of stopping at 42 lines.
 * Helvetica 11 pt averages about 5.5 pt per character; 516 pt of usable width gives a
 * safe 88-character line.
 */
export const PDF_WRAP_CHARS = 88;
const PDF_LINES_PER_PAGE = 44;

export function wrapPdfLine(line: string, width = PDF_WRAP_CHARS): string[] {
  const clean = line
    .replace(/[×]/g, "x")
    .replace(/[−–—]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+$/, "");
  if (clean.length <= width) return [clean];
  const out: string[] = [];
  let current = "";
  for (const word of clean.split(/ +/)) {
    if (word.length > width) {
      if (current) out.push(current);
      for (let i = 0; i < word.length; i += width) out.push(word.slice(i, i + width));
      current = "";
      continue;
    }
    if (!current) current = word;
    else if (current.length + 1 + word.length <= width) current += ` ${word}`;
    else {
      out.push(current);
      current = `  ${word}`;
    }
  }
  if (current) out.push(current);
  return out;
}

export function taxPaperPdf(input: { title: string; taxYear: string; lines: readonly string[]; endingYear?: number }): string {
  const span = input.endingYear ? [taxYearSpan(input.endingYear)] : [];
  const rows = [TAX_INDICATIVE_LABEL, TAX_PACK_NOTE, input.title, input.taxYear, ...span, ...input.lines].flatMap((l) => wrapPdfLine(l));
  const pages: string[][] = [];
  for (let i = 0; i < rows.length; i += PDF_LINES_PER_PAGE) pages.push(rows.slice(i, i + PDF_LINES_PER_PAGE));
  if (!pages.length) pages.push([]);
  const streams = pages.map((pageRows, p) => {
    const commands = ["BT", "/F1 11 Tf", "48 760 Td"];
    pageRows.forEach((line, index) => {
      if (index > 0) commands.push("0 -16 Td");
      commands.push(`(${pdfEscape(line)}) Tj`);
    });
    commands.push("ET");
    if (pages.length > 1) commands.push("BT", "/F1 9 Tf", "48 30 Td", `(${pdfEscape(`Page ${p + 1} of ${pages.length}`)}) Tj`, "ET");
    return commands.join("\n");
  });
  // Objects: 1 catalog, 2 pages, 3 font, then a page + content pair per page.
  const kids = pages.map((_, i) => `${4 + i * 2} 0 R`).join(" ");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Count ${pages.length} /Kids [${kids}] >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  streams.forEach((stream, i) => {
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${5 + i * 2} 0 R /Resources << /Font << /F1 3 0 R >> >> >>`);
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  });
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

/** b26 H-9: every FX rate used on a foreign row, with its source and trade date. */
export function fxRateLines(
  rows: readonly { ticker?: string | null; fx_rate?: number | null; fx_source?: string | null; currency?: string | null; executed_at?: string | null; type?: string | null }[]
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const fx = Number(row.fx_rate);
    const cur = String(row.currency || "").toUpperCase();
    if (!(fx > 0) || !cur || cur === "NZD") continue;
    const day = lotCivilDay(row.executed_at, "") || "date not stored";
    const source = String(row.fx_source || "").trim() || "rate saved with the trade (source not recorded)";
    const line = `${String(row.ticker || "").toUpperCase()} ${row.type || ""} ${day}: ${fx.toFixed(4)} NZD per ${cur}, source ${source}`;
    if (seen.has(line)) continue;
    seen.add(line);
    out.push(line);
  }
  return out.length ? ["FX rates used", ...out] : ["FX rates used: none (no foreign-currency rows in this book)"];
}

/** Distinct stored NZD-per-unit FX rates per ticker, from the ledger rows. */
export function fxRatesByTicker(rows: readonly { ticker?: string | null; fx_rate?: number | null; type?: string | null }[]): Map<string, number[]> {
  const out = new Map<string, number[]>();
  for (const row of rows) {
    const ticker = String(row.ticker || "").toUpperCase();
    const fx = Number(row.fx_rate);
    if (!ticker || !(fx > 0)) continue;
    const list = out.get(ticker) ?? [];
    if (!list.some((v) => Math.abs(v - fx) < 1e-9)) list.push(fx);
    out.set(ticker, list);
  }
  return out;
}

export function fifPaperLines(paper: FifPaper, rows: readonly { ticker?: string | null; fx_rate?: number | null }[] = []): string[] {
  const fx = fxRatesByTicker(rows);
  // Goal b8 H-9: opening and closing values and the FX rate for every holding.
  const holdings = paper.attributing.map((row) => {
    const rates = fx.get(row.ticker.toUpperCase());
    const rateText = rates?.length ? rates.map((r) => r.toFixed(4)).join(" / ") : "none stored";
    // b26 H-9: two short lines so nothing is cut at the right margin.
    return [
      `${row.ticker}: opening NZD ${money(row.openingNzd) || "not entered"}, closing NZD ${money(row.closingNzd) || "not entered"}, FDR NZD ${money(row.fdrNzd) || "-"}, CV NZD ${money(row.cvNzd) || "-"}`,
      ...(row.quickSaleNzd ? [`  ${row.ticker} FDR = 5% of opening NZD ${money(row.fdrBaseNzd)} + quick sale adjustment NZD ${money(row.quickSaleNzd)} (IR461, April 2026)`] : []),
      `  ${row.ticker} FX NZD per unit ${rateText}`,
    ];
  }).flat();
  return [
    `Peak cost NZD ${money(paper.peakCostNzd) || "not calculated"}`,
    fifThresholdSentence(paper),
    ...holdings,
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
