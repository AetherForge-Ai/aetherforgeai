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
  /** Paper cash so a buy can be saved. Only for rows that will be written. */
  fundingDeposits: { date: string; amountNzd: number; note: string }[];
  /** Sum of the file's value column, or quantity times price when that column is absent. */
  sourceTotals: Record<string, number>;
  importedTotals: Record<string, number>;
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
    sourceTotals: {},
    importedTotals: {},
  };
}

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
 * `existingKeys` are duplicate keys already on the book.
 * `openingCashNzd` is the paper cash available before this file.
 * An error plan writes nothing: no trades and no funding deposit.
 */
export function planBrokerImport(
  text: string,
  options?: { mapping?: ColumnMap; existingKeys?: Iterable<string>; openingCashNzd?: number }
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

  const known = new Set(options?.existingKeys || []);
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

  const duplicates: ImportTrade[] = [];
  const toWrite: ImportTrade[] = [];
  for (const row of rows) {
    const key = importDuplicateKey(row);
    if (known.has(key)) duplicates.push(row);
    else {
      known.add(key);
      toWrite.push(row);
    }
  }

  const importedTotals: Record<string, number> = {};
  for (const row of rows) addTotal(importedTotals, row.currency, row.nativeValue);

  const fileError = rows.length === 0 ? "No buy or sell rows could be read. Nothing was written." : null;
  return {
    broker: broker || "generic",
    error: fileError,
    headers: headerCells,
    needsMapping: false,
    rows,
    unsupported,
    duplicates,
    toWrite: fileError ? [] : toWrite,
    fundingDeposits: fileError ? [] : fundingFor(toWrite, options?.openingCashNzd ?? 0),
    sourceTotals,
    importedTotals,
  };
}

/** True only when the plan has trades to save and no file-level error. */
export function importWrites(plan: ImportPlan): boolean {
  return plan.error == null && plan.toWrite.length > 0;
}

function fundingFor(rows: ImportTrade[], openingCashNzd: number): ImportPlan["fundingDeposits"] {
  const ordered = [...rows].sort((a, b) => a.date.localeCompare(b.date) || a.line - b.line);
  let cash = roundMoney(openingCashNzd);
  const deposits: ImportPlan["fundingDeposits"] = [];
  for (const row of ordered) {
    if (row.side === "sell") {
      const proceeds = roundMoney(Math.max(0, row.nativeValue - row.fee) * row.fx);
      cash = roundMoney(cash + proceeds);
      continue;
    }
    if (cash + 0.001 >= row.costNzd) {
      cash = roundMoney(cash - row.costNzd);
      continue;
    }
    const topUp = roundMoney(row.costNzd - cash);
    deposits.push({
      date: row.date,
      amountNzd: topUp,
      note: "Paper cash recorded so the imported buys can be saved. The file did not include this cash balance.",
    });
    cash = 0;
  }
  return deposits;
}

