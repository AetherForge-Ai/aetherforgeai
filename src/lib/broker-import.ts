/**
 * Broker transaction import.
 * Sharesies, Hatch, and IBKR activity files, plus a generic column map.
 * Splits and other corporate actions are listed and not written.
 * A foreign row with no exchange rate is not given a guessed rate.
 *
 * pull-check:batch2-2026-10-11 B2-1
 */

import { roundMoney } from "@/lib/currency";
import { parseHoldingsDate, splitCsvLine } from "@/lib/holdings-csv";

export type ImportBroker = "sharesies" | "hatch" | "ibkr" | "generic";
export type ImportSide = "buy" | "sell";
export type ImportCurrency = "NZD" | "AUD" | "USD";

export interface ColumnMap {
  date: string;
  ticker: string;
  side: string;
  quantity: string;
  price: string;
  fee?: string;
  currency?: string;
  fx?: string;
  value?: string;
}

export interface ImportTrade {
  line: number;
  date: string;
  ticker: string;
  side: ImportSide;
  quantity: number;
  price: number;
  fee: number;
  currency: ImportCurrency;
  /** NZD per 1 unit of the trade currency. NZD trades are 1. */
  fx: number;
  /** Quantity times price, in the trade currency, to the cent. */
  nativeValue: number;
  /** Native value plus fee, converted to NZ$. */
  costNzd: number;
}

export interface UnsupportedRow {
  line: number;
  reason: string;
}

export interface ImportPlan {
  broker: ImportBroker | null;
  error: string | null;
  headers: string[];
  /** True when the file has a header row but no broker shape and no complete map. */
  needsMapping: boolean;
  rows: ImportTrade[];
  unsupported: UnsupportedRow[];
  duplicates: ImportTrade[];
  toWrite: ImportTrade[];
  /** Paper cash so a buy can be saved. Empty unless a deposit is chosen or required. */
  fundingDeposits: { date: string; amountNzd: number; note: string }[];
  /** True when a buy would make paper cash negative without a deposit. */
  fundingNeeded: boolean;
  /** Sum of the file's readable trade values, including rows later marked duplicate. */
  sourceTotals: Record<string, number>;
  /** Sum of the rows that will be saved. Duplicates and skipped rows are left out. */
  importedTotals: Record<string, number>;
  /** Compares the imported total with the rows that will be saved, and names skipped rows. */
  totalsMessage: string;
}

const SIDE_KEYS = ["side", "type", "action", "buy/sell", "buy sell"];
const TICKER_KEYS = ["ticker", "symbol", "code", "instrument code", "instrument", "instrumentcode"];
const DATE_KEYS = ["date", "trade date", "tradedate", "when", "trade_date"];
const QTY_KEYS = ["quantity", "qty", "units", "shares"];
const PRICE_KEYS = ["price", "tradeprice", "trade price", "t. price", "unit price"];
const FEE_KEYS = ["fee", "fees", "commission", "ibcommission", "ib commission"];
const CCY_KEYS = ["currency", "currencyprimary", "currency primary", "ccy"];
const FX_KEYS = ["fx", "fx rate", "fxrate", "fxratetobase", "exchange rate"];
const VALUE_KEYS = ["value", "amount", "proceeds"];

function normHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

function parseImportDate(raw: string): string | null {
  const iso = parseHoldingsDate(raw);
  if (iso) return iso;
  const compact = /^(\d{4})(\d{2})(\d{2})$/.exec(raw.trim());
  if (!compact) return null;
  return parseHoldingsDate(`${compact[1]}-${compact[2]}-${compact[3]}`);
}

function parseNumber(raw: string): number | null {
  const cleaned = raw.trim().replace(/[$,\s]/g, "").replace(/NZ\$|US\$|AU\$/gi, "");
  if (!cleaned || cleaned === "-" || cleaned === "—") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function linesOf(text: string): string[] {
  return text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}

function indexOf(headers: string[], keys: string[]): number {
  return headers.findIndex((header) => keys.includes(header));
}

function detectBroker(headers: string[]): ImportBroker | null {
  if (headers.includes("instrument code")) return "sharesies";
  if (headers.includes("clientaccountid") || headers.includes("buy/sell")) return "ibkr";
  if (headers.includes("trade date") && headers.includes("action") && headers.includes("symbol")) return "hatch";
  return null;
}

function mapFromHeaders(headers: string[], explicit?: ColumnMap): Record<keyof ColumnMap, number> {
  const find = (name: string | undefined, keys: string[]) => {
    if (name) {
      const wanted = normHeader(name);
      const at = headers.findIndex((header) => header === wanted);
      if (at >= 0) return at;
    }
    return indexOf(headers, keys);
  };
  return {
    date: find(explicit?.date, DATE_KEYS),
    ticker: find(explicit?.ticker, TICKER_KEYS),
    side: find(explicit?.side, SIDE_KEYS),
    quantity: find(explicit?.quantity, QTY_KEYS),
    price: find(explicit?.price, PRICE_KEYS),
    fee: find(explicit?.fee, FEE_KEYS),
    currency: find(explicit?.currency, CCY_KEYS),
    fx: find(explicit?.fx, FX_KEYS),
    value: find(explicit?.value, VALUE_KEYS),
  };
}

function emptyPlan(error: string | null, headers: string[] = []): ImportPlan {
  return {
    broker: null,
    error,
    headers,
    needsMapping: false,
    rows: [],
    unsupported: [],
    duplicates: [],
    toWrite: [],
    fundingDeposits: [],
    fundingNeeded: false,
    sourceTotals: {},
    importedTotals: {},
    totalsMessage: "",
  };
}

/** Shown with every paper deposit. Cash goes up. XIRR treats the deposit as money added. */
export const FUNDING_DISCLOSURE =
  "A paper deposit adds that amount to paper cash. It is not money from the broker file. XIRR counts a deposit as money you added, so the money-weighted return changes.";

function addTotal(bag: Record<string, number>, currency: string, amount: number) {
  bag[currency] = roundMoney((bag[currency] || 0) + amount);
}

export function importDuplicateKey(row: {
  date: string;
  ticker: string;
  side: string;
  quantity: number;
  price: number;
}): string {
  return [
    row.date,
    row.ticker.trim().toUpperCase(),
    row.side.trim().toLowerCase(),
    Number(row.quantity).toFixed(8),
    Number(row.price).toFixed(8),
  ].join("|");
}

function parseSide(raw: string): ImportSide | "unsupported" | null {
  const text = raw.trim().toLowerCase();
  if (!text) return null;
  if (["buy", "bought", "purchase", "b"].includes(text)) return "buy";
  if (["sell", "sold", "s"].includes(text)) return "sell";
  if (["dividend", "div", "split", "transfer", "deposit", "withdrawal", "interest", "drp"].includes(text)) {
    return "unsupported";
  }
  return null;
}

function currencyOf(raw: string, ticker: string): ImportCurrency | null {
  const text = raw.trim().toUpperCase();
  if (text === "NZD" || text === "AUD" || text === "USD") return text;
  if (text) return null;
  if (ticker.endsWith(".NZ")) return "NZD";
  if (ticker.endsWith(".AX")) return "AUD";
  return "USD";
}

/**
 * Parse a file and decide what would be written.
 * `existingKeys` are duplicate keys already on the book, one per stored fill.
 * Two identical fills in this file are both kept until stored fills cover them.
 * `openingCashNzd` is the paper cash available before this file.
 * `fundBuys` defaults to on only when a buy would make cash negative.
 * An error plan writes nothing: no trades and no funding deposit.
 */
export function planBrokerImport(
  text: string,
  options?: {
    mapping?: ColumnMap;
    existingKeys?: Iterable<string>;
    openingCashNzd?: number;
    /** False leaves out buys that would make paper cash negative. */
    fundBuys?: boolean;
  }
): ImportPlan {
  const lines = linesOf(text || "");
  if (!lines.length) return emptyPlan("The file is empty. Nothing was written.");

  const headerCells = splitCsvLine(lines[0]).map(normHeader);
  if (headerCells.length < 2) return emptyPlan("This file is not a CSV of trades. Nothing was written.");

  const broker = detectBroker(headerCells);
  const columns = mapFromHeaders(headerCells, options?.mapping);
  const required = [columns.date, columns.ticker, columns.side, columns.quantity, columns.price];
  if (required.some((at) => at < 0)) {
    const plan = emptyPlan(null, headerCells);
    plan.needsMapping = true;
    plan.error = "Choose the date, ticker, side, quantity and price columns. Nothing was written.";
    return plan;
  }

  const storedCounts = countKeys(options?.existingKeys || []);
  const rows: ImportTrade[] = [];
  const unsupported: UnsupportedRow[] = [];
  const sourceTotals: Record<string, number> = {};

  lines.slice(1).forEach((line, index) => {
    const lineNo = index + 2;
    const cells = splitCsvLine(line);
    const blank = cells.every((cell) => !cell.trim());
    if (blank) return;

    const sideRaw = cells[columns.side] || "";
    const side = parseSide(sideRaw);
    if (side === "unsupported") {
      unsupported.push({ line: lineNo, reason: `Unsupported row (${sideRaw.trim() || "blank type"}). Splits are not imported.` });
      return;
    }
    if (side == null) {
      unsupported.push({ line: lineNo, reason: `Side "${sideRaw.trim()}" is not a buy or a sell.` });
      return;
    }

    const date = parseImportDate(cells[columns.date] || "");
    const ticker = (cells[columns.ticker] || "").trim().toUpperCase();
    const quantityRaw = parseNumber(cells[columns.quantity] || "");
    const price = parseNumber(cells[columns.price] || "");
    if (!date || !ticker || quantityRaw == null || price == null) {
      unsupported.push({ line: lineNo, reason: "Date, ticker, quantity or price could not be read." });
      return;
    }
    const quantity = Math.abs(quantityRaw);
    if (!(quantity > 0) || !(price > 0)) {
      unsupported.push({ line: lineNo, reason: "Quantity and price must be greater than zero." });
      return;
    }

    const currency = currencyOf(columns.currency >= 0 ? cells[columns.currency] || "" : "", ticker);
    if (!currency) {
      unsupported.push({ line: lineNo, reason: "Currency must be NZD, AUD or USD." });
      return;
    }
    let fx = currency === "NZD" ? 1 : parseNumber(columns.fx >= 0 ? cells[columns.fx] || "" : "");
    if (fx != null && currency === "USD" && fx > 0 && fx < 1) fx = 1 / fx;
    if (!(fx != null && fx > 0)) {
      unsupported.push({ line: lineNo, reason: "A foreign trade needs the NZD exchange rate from the file. No rate was guessed." });
      return;
    }

    const feeRaw = columns.fee >= 0 ? parseNumber(cells[columns.fee] || "") : 0;
    const fee = feeRaw == null ? 0 : roundMoney(Math.abs(feeRaw));
    const nativeValue = roundMoney(quantity * price);
    const fileValue = columns.value >= 0 ? parseNumber(cells[columns.value] || "") : null;
    if (fileValue != null && roundMoney(Math.abs(fileValue)) !== nativeValue) {
      unsupported.push({
        line: lineNo,
        reason: `Value ${roundMoney(Math.abs(fileValue)).toFixed(2)} does not match quantity times price ${nativeValue.toFixed(2)}.`,
      });
      return;
    }
    addTotal(sourceTotals, currency, fileValue != null ? roundMoney(Math.abs(fileValue)) : nativeValue);

    rows.push({
      line: lineNo,
      date,
      ticker,
      side,
      quantity,
      price,
      fee,
      currency,
      fx: currency === "NZD" ? 1 : fx,
      nativeValue,
      costNzd: roundMoney((nativeValue + fee) * (currency === "NZD" ? 1 : fx)),
    });
  });

  if (!rows.length && !unsupported.length) {
    return { ...emptyPlan("No trade rows were found. Nothing was written.", headerCells), broker };
  }

  const stored = storedCounts;
  const seenInFile = new Map<string, number>();
  const duplicates: ImportTrade[] = [];
  const fresh: ImportTrade[] = [];
  for (const row of rows) {
    const key = importDuplicateKey(row);
    const occurrence = (seenInFile.get(key) || 0) + 1;
    seenInFile.set(key, occurrence);
    if (occurrence <= (stored.get(key) || 0)) duplicates.push(row);
    else fresh.push(row);
  }

  const fileError = rows.length === 0 ? "No buy or sell rows could be read. Nothing was written." : null;
  const cash = fileError
    ? { toWrite: [] as ImportTrade[], deposits: [] as ImportPlan["fundingDeposits"], skipped: [] as UnsupportedRow[], fundingNeeded: false }
    : applyCash(fresh, options?.openingCashNzd ?? 0, options?.fundBuys !== false);
  const skipped = [...unsupported, ...cash.skipped];
  const importedTotals: Record<string, number> = {};
  for (const row of cash.toWrite) addTotal(importedTotals, row.currency, row.nativeValue);

  const plan: ImportPlan = {
    broker: broker || "generic",
    error: fileError,
    headers: headerCells,
    needsMapping: false,
    rows,
    unsupported: skipped,
    duplicates,
    toWrite: cash.toWrite,
    fundingDeposits: cash.deposits,
    fundingNeeded: cash.fundingNeeded,
    sourceTotals,
    importedTotals,
    totalsMessage: "",
  };
  plan.totalsMessage = describeTotals(plan);
  return plan;
}

function countKeys(keys: Iterable<string>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const key of keys) counts.set(key, (counts.get(key) || 0) + 1);
  return counts;
}

/** True only when the plan has trades to save, no file-level error, and skipped rows are acknowledged. */
export function importWrites(plan: ImportPlan, acknowledgeSkipped = false): boolean {
  return plan.error == null && plan.toWrite.length > 0 && (plan.unsupported.length === 0 || acknowledgeSkipped);
}

/** Reject a plan before any row is written. */
export function validateImportForWrite(plan: ImportPlan, acknowledgeSkipped: boolean): string | null {
  if (plan.error) return plan.error;
  if (plan.toWrite.length === 0) return "No trades to save. Nothing was written.";
  if (plan.unsupported.length > 0 && !acknowledgeSkipped) {
    return "Skipped rows are listed in the review. Acknowledge them before saving. Nothing was written.";
  }
  for (const row of plan.toWrite) {
    if (!row.date || !row.ticker || (row.side !== "buy" && row.side !== "sell") || !(row.quantity > 0) || !(row.price > 0) || !(row.fx > 0)) {
      return `Line ${row.line} failed validation. Nothing was written.`;
    }
  }
  for (const deposit of plan.fundingDeposits) {
    if (!deposit.date || !(deposit.amountNzd > 0)) return "A paper deposit failed validation. Nothing was written.";
  }
  return null;
}

export interface ImportWriteStep {
  kind: "deposit" | "trade";
  date: string;
  line: number;
  amountNzd?: number;
  note?: string;
  trade?: ImportTrade;
}

/** Deposits first, then trades, each in date order. */
export function importWriteOrder(plan: ImportPlan): ImportWriteStep[] {
  const deposits = [...plan.fundingDeposits]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((deposit, index) => ({
      kind: "deposit" as const,
      date: deposit.date,
      line: index,
      amountNzd: deposit.amountNzd,
      note: deposit.note,
    }));
  const trades = [...plan.toWrite]
    .sort((a, b) => a.date.localeCompare(b.date) || a.line - b.line)
    .map((trade) => ({
      kind: "trade" as const,
      date: trade.date,
      line: trade.line,
      trade,
    }));
  return [...deposits, ...trades];
}

/** Names the rows that were saved, and says a later import will skip those rows. */
export function importFailureReport(input: {
  cause: string;
  writtenTrades: { date: string; side: string; ticker: string }[];
  writtenDeposits: { date: string; amountNzd: number }[];
}): string {
  if (input.writtenTrades.length === 0 && input.writtenDeposits.length === 0) {
    return `${input.cause} Nothing was saved.`;
  }
  const trades = input.writtenTrades.length
    ? input.writtenTrades.map((row) => `${row.date} ${row.side} ${row.ticker}`).join(", ")
    : "no trades";
  const deposits = input.writtenDeposits.length
    ? input.writtenDeposits.map((row) => `${row.date} NZ$${row.amountNzd.toFixed(2)}`).join(", ")
    : "no paper deposits";
  return `${input.cause} Saved before this failure: ${trades}. Paper deposits saved before this failure: ${deposits}. A second import skips rows that match what was saved.`;
}

function applyCash(rows: ImportTrade[], openingCashNzd: number, allowFunding: boolean) {
  const ordered = [...rows].sort((a, b) => a.date.localeCompare(b.date) || a.line - b.line);
  let cash = roundMoney(openingCashNzd);
  const deposits: ImportPlan["fundingDeposits"] = [];
  const skipped: UnsupportedRow[] = [];
  const toWrite: ImportTrade[] = [];
  let fundingNeeded = false;
  for (const row of ordered) {
    if (row.side === "sell") {
      const proceeds = roundMoney(Math.max(0, row.nativeValue - row.fee) * row.fx);
      cash = roundMoney(cash + proceeds);
      toWrite.push(row);
      continue;
    }
    if (cash + 0.001 >= row.costNzd) {
      cash = roundMoney(cash - row.costNzd);
      toWrite.push(row);
      continue;
    }
    fundingNeeded = true;
    const topUp = roundMoney(row.costNzd - cash);
    if (!allowFunding) {
      skipped.push({
        line: row.line,
        reason: `Left out so paper cash does not go negative. A paper deposit of NZ$${topUp.toFixed(2)} was not chosen. ${FUNDING_DISCLOSURE}`,
      });
      continue;
    }
    deposits.push({
      date: row.date,
      amountNzd: topUp,
      note: `Paper cash of NZ$${topUp.toFixed(2)} is recorded because this buy would otherwise make paper cash negative. The file did not include this balance. ${FUNDING_DISCLOSURE}`,
    });
    cash = 0;
    toWrite.push(row);
  }
  return { toWrite, deposits, skipped, fundingNeeded };
}

function describeTotals(plan: ImportPlan): string {
  const written = sumTotals(plan.toWrite);
  const parts = [totalsMatch(plan.importedTotals, written)
    ? "Imported totals match the rows that will be saved."
    : "Imported totals do not match the rows that will be saved."];
  if (plan.duplicates.length > 0) {
    parts.push(
      `${plan.duplicates.length} duplicate ${plan.duplicates.length === 1 ? "row is" : "rows are"} already on the book and not in the imported total.`
    );
  }
  if (plan.unsupported.length > 0) {
    const listed = plan.unsupported.map((row) => `line ${row.line}: ${row.reason}`).join("; ");
    parts.push(
      `${plan.unsupported.length} skipped ${plan.unsupported.length === 1 ? "row is" : "rows are"} not in the imported total. ${listed}.`
    );
  }
  return parts.join(" ");
}

function sumTotals(rows: ImportTrade[]): Record<string, number> {
  const bag: Record<string, number> = {};
  for (const row of rows) addTotal(bag, row.currency, row.nativeValue);
  return bag;
}

function totalsMatch(left: Record<string, number>, right: Record<string, number>): boolean {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    if (roundMoney(left[key] || 0) !== roundMoney(right[key] || 0)) return false;
  }
  return true;
}

