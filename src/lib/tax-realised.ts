/**
 * Realised profit and loss for one 1 April–31 March year.
 * Lots close oldest first. Crypto disposals are listed on their own.
 * A missing exchange rate is left blank. The baseline FX table is not used.
 *
 * pull-check:track-b-2-2026-10-11
 * pull-check:tax-fixups-2026-10-11
 */

import { roundMoney } from "@/lib/currency";
import { buyLotDay } from "@/lib/lot-day";
import { fifoApplySell, type FifoLot } from "@/lib/ledger-schema";
import { inNzTaxYear, nzTaxYearEnding, nzTaxYearLabel } from "@/lib/nz-tax-year";
import { TAX_INDICATIVE_LABEL } from "@/lib/tax-disclaimer";
import type { TaxLedgerRow } from "@/lib/taxable-income";

export const REALISED_ASSUMPTIONS = [
  "Lots close oldest first. A buy and a sell on the same Auckland day apply the buy first.",
  "Price gain is the closed quantity times (sell price minus buy price), times the NZD rate stored on the sell.",
  "FX gain is the closed quantity times the buy price times (sell rate minus buy rate).",
  "Fees are included. The buy fee in NZ$ is added to the cost of the lot it belongs to (spread per unit), and the sell fee in NZ$ is subtracted from that disposal.",
  "A foreign fill with no stored rate is left blank. No exchange rate is guessed for it. A USD rate entered the other way round (below 1) is read as NZD per USD and converted.",
  "A sell for more units than the open lots is left blank.",
  "Crypto is any row whose asset type is crypto. Other disposals, including metals, are in the other section.",
  "Corrections are not replayed.",
  "A blank disposal is not counted as zero. Totals add only the disposals that have a figure.",
  "This paper reads up to 5,000 ledger rows.",
  "Income, the tax page, the ledger, the holdings gain and this paper use this FIFO figure. A stored amount on an older sell is not a second total.",
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

type OpenLot = FifoLot & { missingRate?: boolean; feePerUnitNzd?: number; missingFee?: boolean };

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

/** The one fee-inclusive lot rule: the buy fee in NZ$ spread per unit onto the lot cost. */
export function buyLotFee(
  row: TaxLedgerRow,
  fx: number | null,
  qty: number
): { feePerUnitNzd: number; missingFee: boolean } {
  const buyFee = feeNzd(row, fx);
  return { feePerUnitNzd: buyFee != null && buyFee > 0 && qty > 0 ? buyFee / qty : 0, missingFee: buyFee == null };
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
  const fill = Number(row.fill_price);
  if (fill > 0) return fill;
  const price = Number(row.price);
  if (price > 0) return price;
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

const disposalCache = new WeakMap<object, RealisedLine[]>();

/** One FIFO walk for every disposal. Later reads of the same book array reuse it. */
export function allRealisedLines(rows: readonly TaxLedgerRow[]): RealisedLine[] {
  const hit = disposalCache.get(rows);
  if (hit) return hit;
  const lines = walkDisposals(rows);
  disposalCache.set(rows, lines);
  return lines;
}

function walkDisposals(rows: readonly TaxLedgerRow[]): RealisedLine[] {
  const books = new Map<string, OpenLot[]>();
  const events = rows
    .filter((row) => row.type === "buy" || row.type === "sell" || row.type === "opening_balance")
    .map((row) => ({ row, day: buyLotDay(row) }))
    .filter((event) => event.day)
    .sort((a, b) => a.day.localeCompare(b.day) || String(a.row.type).localeCompare(String(b.row.type)));

  const lines: RealisedLine[] = [];

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
      const missingLot = closed.closedPairs.some(
        (pair) => Boolean((pair.buy as OpenLot).missingRate) || Boolean((pair.buy as OpenLot).missingFee)
      );
      const buyFeeNzd = closed.closedPairs.reduce(
        (sum, pair) => sum + pair.qty * ((pair.buy as OpenLot).feePerUnitNzd || 0),
        0
      );
      const incomplete = fx == null || fee == null || missingLot || qty - closedQty > 1e-6 || !(price > 0);
      const matched = closed.closedPairs.map((pair) => ({
        acquired: pair.buy.tradeDatetime,
        quantity: pair.qty,
        costBasisNzd: roundMoney(
          pair.qty * pair.buy.fillPrice * (pair.buy.fxRate > 0 ? pair.buy.fxRate : 0) +
            pair.qty * ((pair.buy as OpenLot).feePerUnitNzd || 0)
        ),
      }));
      const fifoNzd = incomplete ? null : roundMoney(closed.realized_pnl_nzd - buyFeeNzd - (fee || 0));
      const stored = storedRealised(row);
      const diffNote = null;
      const line: RealisedLine = {
        when: event.day,
        ticker,
        assetType: String(row.asset_type || ""),
        section: isCrypto(row) ? "crypto" : "other",
        quantity: qty,
        pricePnlNzd: incomplete ? null : roundMoney(closed.realized_price_pnl_nzd - buyFeeNzd),
        fxPnlNzd: incomplete ? null : closed.realized_fx_pnl_nzd,
        feeNzd: incomplete ? null : fee,
        realisedNzd: fifoNzd,
        lots: matched,
        proceedsNzd: incomplete || fx == null ? null : roundMoney(qty * price * fx - (fee || 0)),
        storedRealisedNzd: stored,
        diffNote,
      };
      lines.push(line);
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
      ...buyLotFee(row, fx, qty),
    });
  }

  return lines;
}

export function realisedByTaxYear(rows: readonly TaxLedgerRow[], endingYear: number): RealisedReport {
  const matched = allRealisedLines(rows).filter((line) => inNzTaxYear(line.when, endingYear));
  const other = matched.filter((line) => line.section !== "crypto");
  const crypto = matched.filter((line) => line.section === "crypto");
  const sum = (group: RealisedLine[]) =>
    roundMoney(group.reduce((total, line) => total + (line.realisedNzd ?? 0), 0));
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
    blankCount: matched.filter((line) => line.realisedNzd == null).length,
    storedDiffCount: 0,
    assumptions: REALISED_ASSUMPTIONS,
  };
}

/**
 * The figure a new sell should store. Same lots, price, FX and fee as the realised page.
 * pull-check:batch1-2026-10-11 R10
 */
export function fifoStoredForSell(
  prior: readonly TaxLedgerRow[],
  sell: TaxLedgerRow
): { pricePnlNzd: number; fxPnlNzd: number; realisedNzd: number } | null {
  const day = buyLotDay(sell);
  const ending = nzTaxYearEnding(day);
  if (!day || ending == null) return null;
  const ticker = String(sell.ticker || "").trim().toUpperCase();
  const report = realisedByTaxYear([...prior, { ...sell, type: "sell" }], ending);
  const lines = [...report.other, ...report.crypto].filter((line) => line.ticker === ticker && line.when === day);
  const line = lines[lines.length - 1];
  if (!line || line.realisedNzd == null || line.pricePnlNzd == null || line.fxPnlNzd == null) return null;
  return { pricePnlNzd: line.pricePnlNzd, fxPnlNzd: line.fxPnlNzd, realisedNzd: line.realisedNzd };
}

/** One income total. The income page uses the FIFO figure, so there is no second headline. */
export function incomeReconciliationNote(_storedNzd: number, _fifoNzd: number): string | null {
  return null;
}

function openBooks(rows: readonly TaxLedgerRow[]): Map<string, OpenLot[]> {
  const books = new Map<string, OpenLot[]>();
  const events = rows
    .filter((row) => row.type === "buy" || row.type === "sell" || row.type === "opening_balance")
    .map((row) => ({ row, day: buyLotDay(row) }))
    .filter((event) => event.day)
    .sort((a, b) => a.day.localeCompare(b.day) || String(a.row.type).localeCompare(String(b.row.type)));
  for (const event of events) {
    const row = event.row;
    const ticker = String(row.ticker || "").trim().toUpperCase();
    if (!ticker) continue;
    const lots = books.get(ticker) || [];
    books.set(ticker, lots);
    const qty = movementQty(row);
    const price = movementPrice(row);
    if (!(qty > 0) || !(price > 0)) continue;
    if (row.type === "sell") {
      const fx = fxOf(row);
      const closed = fifoApplySell(lots, qty, price, fx ?? 0);
      books.set(ticker, closed.remainingLots as OpenLot[]);
      continue;
    }
    const fx = fxOf(row);
    lots.push({
      qty,
      fillPrice: price,
      fillCurrency: String(row.currency || "NZD").toUpperCase(),
      fxRate: fx ?? 0,
      tradeDatetime: event.day,
      missingRate: fx == null,
      ...buyLotFee(row, fx, qty),
    });
  }
  return books;
}

const openFxCache = new WeakMap<object, { cost: Map<string, number>; qty: Map<string, number> }>();

/** Cost-weighted and quantity-weighted open rates from one lot walk. */
export function openFxMaps(rows: readonly TaxLedgerRow[]): { cost: Map<string, number>; qty: Map<string, number> } {
  const hit = openFxCache.get(rows);
  if (hit) return hit;
  const cost = new Map<string, number>();
  const qtyRates = new Map<string, number>();
  for (const [ticker, lots] of openBooks(rows)) {
    const open = lots.filter((lot) => lot.qty > 1e-12);
    if (!open.length || open.some((lot) => lot.missingRate || !(lot.fxRate > 0))) continue;
    let native = 0;
    let costWeighted = 0;
    let qty = 0;
    let qtyWeighted = 0;
    for (const lot of open) {
      const lotCost = lot.qty * lot.fillPrice;
      native += lotCost;
      costWeighted += lotCost * lot.fxRate;
      qty += lot.qty;
      qtyWeighted += lot.qty * lot.fxRate;
    }
    if (native > 1e-9) cost.set(ticker, costWeighted / native);
    if (qty > 1e-9) qtyRates.set(ticker, qtyWeighted / qty);
  }
  const maps = { cost, qty: qtyRates };
  openFxCache.set(rows, maps);
  return maps;
}

/** Open share quantity per ticker. Used to drop an aggregate row that repeats the lots. */
export function fifoRemainingShareQty(rows: readonly TaxLedgerRow[]): Map<string, number> {
  const qty = new Map<string, number>();
  for (const [ticker, lots] of openBooks(rows)) {
    const open = lots.reduce((sum, lot) => sum + lot.qty, 0);
    if (open > 1e-9) qty.set(ticker, open);
  }
  return qty;
}

/** Native unit cost of whatever FIFO lots are still open. */
export function fifoRemainingUnitCosts(rows: readonly TaxLedgerRow[]): Map<string, number> {
  const costs = new Map<string, number>();
  for (const [ticker, lots] of openBooks(rows)) {
    const qty = lots.reduce((sum, lot) => sum + lot.qty, 0);
    if (!(qty > 1e-9)) continue;
    const native = lots.reduce((sum, lot) => sum + lot.qty * lot.fillPrice, 0);
    costs.set(ticker, native / qty);
  }
  return costs;
}

/**
 * Cost-weighted NZD rate on the lots still open.
 * A ticker is omitted when any open lot has no stored rate, so the currency
 * line is not filled from a guess.
 */
export function fifoRemainingCostFx(rows: readonly TaxLedgerRow[]): Map<string, number> {
  return openFxMaps(rows).cost;
}

/**
 * Quantity-weighted NZD rate on the lots still open: sum(q_i × fx_i) / Q.
 * The currency line uses this. Cost stays on fifoRemainingCostFx.
 * A ticker is omitted when any open lot has no stored rate.
 */
export function fifoRemainingQtyFx(rows: readonly TaxLedgerRow[]): Map<string, number> {
  return openFxMaps(rows).qty;
}

/**
 * Realised FX in full precision: Σ quantity closed × buy fill × (sell FX − buy FX).
 * Lines are not rounded before the sum. A lot or a sell with no stored rate is skipped.
 */
export function sumRealisedFxNzd(rows: readonly TaxLedgerRow[]): number {
  let total = 0;
  const books = new Map<string, OpenLot[]>();
  const events = rows
    .filter((row) => row.type === "buy" || row.type === "sell" || row.type === "opening_balance")
    .map((row) => ({ row, day: buyLotDay(row) }))
    .filter((event) => event.day)
    .sort((a, b) => a.day.localeCompare(b.day) || String(a.row.type).localeCompare(String(b.row.type)));
  for (const event of events) {
    const row = event.row;
    const ticker = String(row.ticker || "").trim().toUpperCase();
    if (!ticker) continue;
    const lots = books.get(ticker) || [];
    books.set(ticker, lots);
    const qty = movementQty(row);
    const price = movementPrice(row);
    if (!(qty > 0) || !(price > 0)) continue;
    if (row.type === "sell") {
      const fx = fxOf(row);
      const closed = fifoApplySell(lots, qty, price, fx ?? 0);
      books.set(ticker, closed.remainingLots as OpenLot[]);
      if (fx == null) continue;
      for (const pair of closed.closedPairs) {
        const buy = pair.buy as OpenLot;
        if (buy.missingRate || !(buy.fxRate > 0)) continue;
        total += pair.qty * buy.fillPrice * (pair.sellFx - buy.fxRate);
      }
      continue;
    }
    const fx = fxOf(row);
    lots.push({
      qty,
      fillPrice: price,
      fillCurrency: String(row.currency || "NZD").toUpperCase(),
      fxRate: fx ?? 0,
      tradeDatetime: event.day,
      missingRate: fx == null,
      ...buyLotFee(row, fx, qty),
    });
  }
  return total;
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
  return `${lines.join("\n")}\n`;
}
