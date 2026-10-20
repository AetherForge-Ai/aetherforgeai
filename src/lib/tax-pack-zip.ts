import { moneyCell } from "@/lib/currency";
import { csvEscape } from "@/lib/csv-cell";
import type { FifPaper } from "@/lib/fif-working-paper";
import { inNzTaxYear } from "@/lib/nz-tax-year";
import { readSplit } from "@/lib/stock-split";
import { TAX_INDICATIVE_LABEL } from "@/lib/tax-disclaimer";
import type { TaxLedgerRow } from "@/lib/taxable-income";

/**
 * b29 H-9 (research addendum §6): extra CSVs for the tax-pack ZIP, from the same rows as the PDF.
 * Every row carries the source ledger row id so an accountant can trace it.
 */
const money = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? "" : moneyCell(v)); // b51 G-12: the one rule
const line = (cells: unknown[]) => cells.map((c) => csvEscape(c == null ? "" : String(c))).join(",");
const day = (row: TaxLedgerRow) => String((row as { executed_at?: string }).executed_at || (row as { createdAt?: string }).createdAt || "").slice(0, 10);
const id = (row: TaxLedgerRow) => String((row as { _id?: string; id?: string })._id || (row as { id?: string }).id || "");

/** Opening (1 April) and closing (31 March) positions per FIF/AU holding, as on the working paper. */
export function positionsCsv(paper: FifPaper): string {
  const out = [line(["Holding", "Class", "Opening market value NZD (1 Apr)", "Closing market value NZD (31 Mar)", "Cost of open lots NZD", "FDR NZD", "Comparative value NZD", "Label"])];
  for (const p of [...paper.attributing, ...paper.australian]) {
    out.push(line([p.ticker, p.className, money(p.openingNzd), money(p.closingNzd), money(p.costNzd), money(p.fdrNzd), money(p.cvNzd), TAX_INDICATIVE_LABEL]));
  }
  return out.join("\n");
}

/** Buys and sells in the tax year, with the FX rate used and the ledger row id. */
export function tradesCsv(rows: readonly TaxLedgerRow[], endingYear: number): string {
  const out = [line(["Date", "Type", "Ticker", "Quantity", "Price", "Currency", "FX rate (NZD per unit)", "Cash NZD", "Ledger row"])];
  for (const r of rows) {
    const type = String(r.type || "");
    if (type !== "buy" && type !== "sell") continue;
    const when = day(r);
    if (!when || !inNzTaxYear(when, endingYear)) continue;
    const any = r as Record<string, unknown>;
    out.push(line([when, type, r.ticker, any.quantity, any.price, any.fill_currency || any.currency || "NZD", any.fx_rate ?? "", money(Number(any.cash_nzd)), id(r)]));
  }
  return out.join("\n");
}

/** Splits and dividend reinvestment allotments in the tax year. */
export function corporateActionsCsv(rows: readonly TaxLedgerRow[], endingYear: number): string {
  const out = [line(["Date", "Action", "Ticker", "Detail", "Ledger row"])];
  for (const r of rows) {
    const any = r as Record<string, unknown>;
    const notes = typeof any.notes === "string" ? any.notes : "";
    const split = readSplit(notes);
    if (split && inNzTaxYear(split.date, endingYear)) {
      out.push(line([split.date, "split", r.ticker, `${split.ratio}:1`, id(r)]));
      continue;
    }
    const when = day(r);
    if (when && inNzTaxYear(when, endingYear) && (String(r.type) === "drp" || /\bDRP\b/i.test(notes))) {
      out.push(line([when, "dividend reinvestment", r.ticker, `${any.quantity ?? ""} shares at ${any.price ?? ""}`, id(r)]));
    }
  }
  return out.join("\n");
}
