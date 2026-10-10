/**
 * Realised profit and loss for one 1 April–31 March year.
 * Lots close oldest first. Crypto disposals are listed on their own.
 * A missing exchange rate is left blank. The baseline FX table is not used.
 *
 * pull-check:track-b-2-2026-10-11
 * pull-check:tax-fixups-2026-10-11
 */

import { roundMoney } from "@/lib/currency";
import { lotCivilDay } from "@/lib/executed-at";
import { fifoApplySell, type FifoLot } from "@/lib/ledger-schema";
import { inNzTaxYear, nzTaxYearLabel } from "@/lib/nz-tax-year";
import { TAX_INDICATIVE_LABEL } from "@/lib/tax-disclaimer";
import type { TaxLedgerRow } from "@/lib/taxable-income";

export const REALISED_ASSUMPTIONS = [
  "Lots close oldest first. A buy and a sell on the same Auckland day apply the buy first.",
  "Price gain is the closed quantity times (sell price minus buy price), times the NZD rate stored on the sell.",
  "FX gain is the closed quantity times the buy price times (sell rate minus buy rate).",
  "The sell fee in NZ$ is subtracted from that disposal. Buy fees are not added on top of the stored buy price.",
  "A foreign fill with no stored rate is left blank. The baseline FX table is not used. A USD rate below 1 is flipped, because that quote is NZD per USD the other way. An AUD rate below 1 is kept.",
  "A sell for more units than the open lots is left blank.",
  "Crypto is any row whose asset type is crypto. Other disposals, including metals, are in the other section.",
  "Corrections are not replayed.",
  "A blank disposal is not counted as zero. Totals add only the disposals that have a figure.",
  "This paper reads up to 5,000 ledger rows.",
  "The income summary keeps the realised amount stored on the sell. When that stored amount differs from this FIFO line, the row says so.",
] as const;

export interface RealisedLot {
  acquired: string;
  quantity: number;
  costBasisNzd: number;
}

export type RealisedSection = "other" | "crypto";

export interface RealisedLine {
  when: string;
  ticker: string;
  assetType: string;
  section: RealisedSection;
  quantity: number;
  pricePnlNzd: number | null;
  fxPnlNzd: number | null;
  feeNzd: number | null;
  realisedNzd: number | null;
  lots: RealisedLot[];
  proceedsNzd: number | null;
  /** Amount stored on the sell. Null when the sell did not store one. */
  storedRealisedNzd: number | null;
  /** Set when the stored amount and the FIFO figure differ. */
  diffNote: string | null;
}

export interface RealisedReport {
  endingYear: number;
  label: string;
  other: RealisedLine[];
  crypto: RealisedLine[];
  otherTotalNzd: number;
  cryptoTotalNzd: number;
  combinedNzd: number;
  /** Disposals left blank because a rate or a lot was missing. */
  blankCount: number;
  /** Rows whose stored sell amount differs from the FIFO figure. */
  storedDiffCount: number;
  assumptions: readonly string[];
}

type OpenLot = FifoLot & { missingRate?: boolean };

function fxOf(row: TaxLedgerRow): number | null {
  const currency = String(row.currency || "NZD").toUpperCase();
  if (currency === "NZD") return 1;
  const fx = Number(row.fx_rate);
  if (!(fx > 0) || !Number.isFinite(fx)) return null;
  if (currency === "USD" && fx < 1) return 1 / fx;
  return fx;
}

function feeNzd(row: TaxLedgerRow, fx: number | null): number | null {
  if (typeof row.fees_nzd === "number" && Number.isFinite(row.fees_nzd)) return roundMoney(row.fees_nzd);
  const fees = Number(row.fees);
  if (!Number.isFinite(fees) || fees === 0) return 0;
  if (fees < 0 || fx == null) return null;
  return roundMoney(fees * fx);
}

function isCrypto(row: TaxLedgerRow): boolean {
  return String(row.asset_type || "").toLowerCase() === "crypto";
}

function movementQty(row: TaxLedgerRow): number {
  const qty = Number(row.quantity);
  if (qty > 0) return qty;
  const match = String(row.notes || "").match(/\bqty=([0-9]*\.?[0-9]+)/i);
  const parsed = match ? Number(match[1]) : 0;
  return parsed > 0 ? parsed : 0;
}

function movementPrice(row: TaxLedgerRow): number {
  const price = Number(row.price);
  if (price > 0) return price;
  const fill = Number(row.fill_price);
  if (fill > 0) return fill;
  const match = String(row.notes || "").match(/\bfill=([0-9]*\.?[0-9]+)/i);
  const parsed = match ? Number(match[1]) : 0;
  return parsed > 0 ? parsed : 0;
}

function storedRealised(row: TaxLedgerRow): number | null {
  if (typeof row.realized_pnl_nzd === "number" && Number.isFinite(row.realized_pnl_nzd)) {
    return roundMoney(row.realized_pnl_nzd);
  }
  if (typeof row.realized_pnl === "number" && Number.isFinite(row.realized_pnl)) {
    return roundMoney(row.realized_pnl);
  }
  return null;
}

export function realisedByTaxYear(rows: readonly TaxLedgerRow[], endingYear: number): RealisedReport {
  const books = new Map<string, OpenLot[]>();
  const events = rows
    .filter((row) => row.type === "buy" || row.type === "sell" || row.type === "opening_balance")
    .map((row) => ({ row, day: lotCivilDay(row.executed_at || row.createdAt, "") }))
    .filter((event) => event.day)
    .sort((a, b) => a.day.localeCompare(b.day) || String(a.row.type).localeCompare(String(b.row.type)));

  const other: RealisedLine[] = [];
  const crypto: RealisedLine[] = [];
  let blankCount = 0;
  let storedDiffCount = 0;

  for (const event of events) {
    const row = event.row;
    const ticker = String(row.ticker || "").trim().toUpperCase();
    if (!ticker) continue;
    const lots = books.get(ticker) || [];
    books.set(ticker, lots);
    const qty = movementQty(row);
    const price = movementPrice(row);
    if (!(qty > 0)) continue;
    if (row.type === "sell") {
      const fx = fxOf(row);
      const fee = feeNzd(row, fx);
      const closed = fifoApplySell(lots, qty, price, fx ?? 0);
      books.set(ticker, closed.remainingLots as OpenLot[]);
      const closedQty = closed.closedPairs.reduce((sum, pair) => sum + pair.qty, 0);
      const missingLot = closed.closedPairs.some((pair) => Boolean((pair.buy as OpenLot).missingRate));
      const inYear = inNzTaxYear(event.day, endingYear);
      if (!inYear) continue;
      const incomplete = fx == null || fee == null || missingLot || qty - closedQty > 1e-6 || !(price > 0);
      const matched = closed.closedPairs.map((pair) => ({
        acquired: pair.buy.tradeDatetime,
        quantity: pair.qty,
        costBasisNzd: roundMoney(pair.qty * pair.buy.fillPrice * (pair.buy.fxRate > 0 ? pair.buy.fxRate : 0)),
      }));
      const fifoNzd = incomplete ? null : roundMoney(closed.realized_pnl_nzd - (fee || 0));
      const stored = storedRealised(row);
      const diffNote =
        fifoNzd != null && stored != null && Math.abs(fifoNzd - stored) >= 0.005
          ? `Ledger stored NZ$${stored.toFixed(2)} on this sell. This FIFO line is NZ$${fifoNzd.toFixed(2)}. The income summary keeps the stored amount.`
          : null;
      if (diffNote) storedDiffCount += 1;
      const line: RealisedLine = {
        when: event.day,
        ticker,
        assetType: String(row.asset_type || ""),
        section: isCrypto(row) ? "crypto" : "other",
        quantity: qty,
        pricePnlNzd: incomplete ? null : closed.realized_price_pnl_nzd,
        fxPnlNzd: incomplete ? null : closed.realized_fx_pnl_nzd,
        feeNzd: incomplete ? null : fee,
        realisedNzd: fifoNzd,
        lots: matched,
        proceedsNzd: incomplete || fx == null ? null : roundMoney(qty * price * fx - (fee || 0)),
        storedRealisedNzd: stored,
        diffNote,
      };
      if (incomplete) blankCount += 1;
      (line.section === "crypto" ? crypto : other).push(line);
      continue;
    }
    if (!(price > 0)) continue;
    const fx = fxOf(row);
    lots.push({
      qty,
      fillPrice: price,
      fillCurrency: String(row.currency || "NZD").toUpperCase(),
      fxRate: fx ?? 0,
      tradeDatetime: event.day,
      missingRate: fx == null,
    });
  }

  const sum = (lines: RealisedLine[]) =>
    roundMoney(lines.reduce((total, line) => total + (line.realisedNzd ?? 0), 0));
  const otherTotalNzd = sum(other);
  const cryptoTotalNzd = sum(crypto);

  return {
    endingYear,
    label: nzTaxYearLabel(endingYear),
    other,
    crypto,
    otherTotalNzd,
    cryptoTotalNzd,
    combinedNzd: roundMoney(otherTotalNzd + cryptoTotalNzd),
    blankCount,
    storedDiffCount,
    assumptions: REALISED_ASSUMPTIONS,
  };
}

export const REALISED_CSV_COLUMNS = [
  "Tax year",
  "Date",
  "Holding",
  "Section",
  "Quantity",
  "Price gain NZD",
  "FX gain NZD",
  "Sell fee NZD",
  "Realised NZD",
  "Label",
] as const;

function csvEscape(value: unknown): string {
  const text = value == null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function cellMoney(value: number | null): string {
  if (value == null) return "";
  return roundMoney(value).toFixed(2);
}

export function realisedCsv(report: RealisedReport, formatDate: (value: string) => string): string {
  const lines = [REALISED_CSV_COLUMNS.join(",")];
  const push = (cells: unknown[]) => lines.push(cells.map(csvEscape).join(","));
  const emit = (row: RealisedLine) =>
    push([
      report.label,
      formatDate(row.when),
      row.ticker,
      row.section,
      row.quantity,
      cellMoney(row.pricePnlNzd),
      cellMoney(row.fxPnlNzd),
      cellMoney(row.feeNzd),
      cellMoney(row.realisedNzd),
      TAX_INDICATIVE_LABEL,
    ]);
  for (const row of report.other) emit(row);
  for (const row of report.crypto) emit(row);
  push([report.label, "", "", "other-total", "", "", "", "", cellMoney(report.otherTotalNzd), TAX_INDICATIVE_LABEL]);
  push([report.label, "", "", "crypto-total", "", "", "", "", cellMoney(report.cryptoTotalNzd), TAX_INDICATIVE_LABEL]);
  push([report.label, "", "", "combined", "", "", "", "", cellMoney(report.combinedNzd), TAX_INDICATIVE_LABEL]);
  return lines.join("\n");
}
