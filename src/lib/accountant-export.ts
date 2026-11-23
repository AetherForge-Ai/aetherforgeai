/**
 * Accountant book pack. Reads figures already stored on the ledger and the holding price.
 * No FIF or IR3 result is calculated or presented. No third-party file (Xero or otherwise).
 * Share with accountant is future work: this module only builds a download.
 */
import { buildPortfolioSnapshot, inferTradeCurrency, type SnapshotLedgerRow, type SnapshotPosition } from "@/lib/portfolio-snapshot";
import { csvEscape } from "@/lib/csv-cell";
import { csvUnitPrice } from "@/lib/transaction-csv";
import { formatCleanNumber, formatFxInput, moneyCell } from "@/lib/currency";
import { dividendViewFromRow, type DividendSourceRow } from "@/lib/dividend-ledger";
import { lotCivilDay } from "@/lib/executed-at";
import { buyLotDay } from "@/lib/lot-day";
import { isNzTaxYearEnding, nzTaxYearEnding, nzTaxYearLabel } from "@/lib/nz-tax-year";
import { buildZip } from "@/lib/zip-store";
import { ACCOUNTANT_PACK_LABEL } from "@/lib/accountant-export-label";

export { ACCOUNTANT_PACK_LABEL };

export const HOLDINGS_COLUMNS = [
  "Holding",
  "Name",
  "Quantity",
  "Currency",
  "Cost basis NZD",
  "Cost FX rate",
  "Cost FX date",
  "Cost FX detail",
  "Market value NZD",
  "Market FX rate",
  "Market FX date",
  "Price date",
  "Data note",
] as const;

export const TRANSACTION_COLUMNS = [
  "Date",
  "Type",
  "Holding",
  "Quantity",
  "Price",
  "Currency",
  "FX rate",
  "FX date",
  "FX source",
  "Fees NZD",
  "Cash NZD",
  "Ledger row",
] as const;

export const DIVIDEND_COLUMNS = [
  "Payment date",
  "Holding",
  "Currency",
  "FX rate",
  "Gross NZD",
  "Imputation credits NZD",
  "RWT NZD",
  "Foreign tax NZD",
  "Net cash NZD",
  "Breakdown",
  "Ledger row",
] as const;

const HOLDINGS_DEFINITIONS = {
  Holding: "The ticker stored on the open lots.",
  Name: "The name stored on the lot, or the ticker when no name was stored.",
  Quantity: "Open quantity at the holdings date, after sells, stored splits and stored dividend-reinvestment shares.",
  Currency: "Trade currency stored on the lots (NZD, USD or AUD).",
  "Cost basis NZD":
    "Open lots: each quantity times its fill price times the exchange rate stored on the buy, in NZD. Brokerage is not included. Blank when a lot has no stored rate.",
  "Cost FX rate":
    "NZD per 1 unit used for that cost, when every open lot used the same rate. Blank when the lots used more than one rate (see Cost FX detail).",
  "Cost FX date": "The trade date of that rate, when every open lot shares one date. Blank when the dates differ.",
  "Cost FX detail": "Each open lot's trade date and the NZD-per-unit rate used, separated by a semicolon.",
  "Market value NZD":
    "Open quantity times the stored price, for an NZD holding, when that price date is on or before the holdings date. Blank when no usable NZD price is stored.",
  "Market FX rate": "1.0000 when the market value is filled for an NZD holding. Blank otherwise. This export does not look up a rate.",
  "Market FX date": "The stored price date when the market value is filled. Blank otherwise.",
  "Price date": "The date stored with the holding's price. Blank when no price date is stored.",
  "Data note": "Why a cost or market value cell is blank. Empty when both figures are filled.",
} satisfies Record<(typeof HOLDINGS_COLUMNS)[number], string>;

const TRANSACTION_DEFINITIONS = {
  Date: "The Auckland civil date of the row.",
  Type: "The stored type. This file includes buy, sell, dividend, fee and tax.",
  Holding: "The ticker stored on the row. Blank on a fee or tax row that has no ticker.",
  Quantity: "The quantity stored on the row.",
  Price: "The fill price stored on the row, in the trade currency. Unit prices keep their stored precision.",
  Currency:
    "The currency stored on the row. A .NZ ticker with no currency stored is read as NZD, and a .AX ticker as AUD, the same way the book reads it. Otherwise blank.",
  "FX rate":
    "NZD per 1 unit of the trade currency, the rate stored on the row. NZD is 1.0000. A USD rate stored below 1 is shown inverted, because that is the rate the book uses. Blank when a foreign row has no stored rate.",
  "FX date": "The civil date of the stored fx_timestamp when the row has one. Otherwise the row date.",
  "FX source": "The source stored on the row. Blank when none was stored.",
  "Fees NZD":
    "The stored fees_nzd. When only a native fee is stored, it is converted with the rate stored on that row. Blank when no fee was stored.",
  "Cash NZD": "The stored cash_nzd, or the stored total when cash_nzd is absent. Blank when neither was stored.",
  "Ledger row": "The stored row id.",
} satisfies Record<(typeof TRANSACTION_COLUMNS)[number], string>;

const DIVIDEND_DEFINITIONS = {
  "Payment date": "The Auckland civil date of the dividend. This is also the date of the stored exchange rate.",
  Holding: "The ticker stored on the dividend.",
  Currency: "The currency stored in the dividend breakdown. Blank when the row has no breakdown.",
  "FX rate": "The payment-date rate stored in the breakdown, NZD per 1 unit. Blank when no breakdown was stored.",
  "Gross NZD": "The gross amount stored in the breakdown. Blank when no breakdown was stored.",
  "Imputation credits NZD":
    "The imputation credits stored on the dividend, in NZD. A stored zero is 0.00. Blank when no breakdown was stored.",
  "RWT NZD":
    "The withholding stored on an NZD dividend. Blank when the dividend is in another currency or no breakdown was stored. This is the stored amount, not a calculated resident withholding tax.",
  "Foreign tax NZD":
    "The withholding stored on a dividend that is not in NZD. Blank for an NZD dividend or when no breakdown was stored. This is the stored amount, not a calculated foreign tax credit.",
  "Net cash NZD":
    "Gross minus withholding minus dividend reinvestment, from the stored breakdown. When no breakdown was stored, the stored cash amount. Blank when that cash amount was not stored.",
  Breakdown: 'stored when the dividend has a stored breakdown. "cash only, no tax breakdown stored" otherwise.',
  "Ledger row": "The stored row id.",
} satisfies Record<(typeof DIVIDEND_COLUMNS)[number], string>;

const TX_TYPES = new Set(["buy", "sell", "dividend", "fee", "tax"]);

export interface AccountantLedgerRow extends SnapshotLedgerRow {
  user?: string | { _id?: string | null } | null;
  fill_currency?: string | null;
  fx_source?: string | null;
  fx_timestamp?: string | null;
}

export interface StoredPrice {
  ticker: string;
  price: number | null;
  /** ISO time or civil date the price was saved. */
  asOf?: string | null;
  source?: string | null;
}

export interface AccountantRange {
  endingYear: number;
  taxYearLabel: string;
  asOf: string;
  from: string;
  to: string;
}

export interface AccountantPack {
  holdings: string;
  transactions: string;
  dividends: string;
  readme: string;
  range: AccountantRange;
}

export function ownerId(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (typeof value === "object" && "_id" in value) {
    const id = (value as { _id?: unknown })._id;
    if (id == null || id === "") return null;
    return String(id);
  }
  return null;
}

/** Drops a row whose stored owner is someone else. A row with no owner is kept (the query was already for this account). */
export function rowsOwnedBy<T extends { user?: unknown }>(rows: readonly T[], userId: string): T[] {
  return rows.filter((row) => {
    const owner = ownerId(row.user);
    return owner == null || owner === userId;
  });
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const dt = new Date(Date.UTC(year, month - 1, day));
  return dt.getUTCFullYear() === year && dt.getUTCMonth() === month - 1 && dt.getUTCDate() === day;
}

export function resolveAccountantRange(
  params: { year?: string | null; asOf?: string | null; from?: string | null; to?: string | null },
  today: string
): { ok: true; range: AccountantRange } | { ok: false; error: string } {
  if (!isIsoDate(today)) return { ok: false, error: "Tax year was not recognised." };
  const yearText = String(params.year ?? "").trim();
  const toText = String(params.to ?? "").trim();
  let endingYear: number | null;
  if (yearText) {
    const parsed = Number(yearText);
    if (!isNzTaxYearEnding(parsed)) return { ok: false, error: "Tax year was not recognised." };
    endingYear = parsed;
  } else if (toText) {
    if (!isIsoDate(toText)) return { ok: false, error: "Use dates as YYYY-MM-DD." };
    endingYear = nzTaxYearEnding(toText);
    if (endingYear == null || !isNzTaxYearEnding(endingYear)) return { ok: false, error: "Tax year was not recognised." };
  } else {
    endingYear = nzTaxYearEnding(today);
    if (endingYear == null) return { ok: false, error: "Tax year was not recognised." };
  }
  const yearStart = `${endingYear - 1}-04-01`;
  const yearEnd = `${endingYear}-03-31`;
  const from = String(params.from ?? "").trim() || yearStart;
  const to = toText || yearEnd;
  const asOfDefault = today >= yearStart && today <= yearEnd ? today : today > yearEnd ? yearEnd : yearStart;
  const asOf = String(params.asOf ?? "").trim() || asOfDefault;
  if (!isIsoDate(from) || !isIsoDate(to) || !isIsoDate(asOf)) return { ok: false, error: "Use dates as YYYY-MM-DD." };
  if (from > to) return { ok: false, error: "The transaction start is after the end." };
  return { ok: true, range: { endingYear, taxYearLabel: nzTaxYearLabel(endingYear), asOf, from, to } };
}

export function accountantExportDefaults(today: string): AccountantRange | null {
  const resolved = resolveAccountantRange({}, today);
  return resolved.ok ? resolved.range : null;
}

function nzdCell(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "";
  return moneyCell(value);
}

function qtyCell(value: unknown): string {
  if (value == null || value === "") return "";
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return "";
  return formatCleanNumber(n);
}

function csvDoc(headers: readonly string[], rows: readonly (readonly string[])[]): string {
  const lines = [headers.join(",")];
  for (const row of rows) lines.push(row.map((cell) => csvEscape(cell)).join(","));
  return `${lines.join("\n")}\n`;
}

function rowDay(row: AccountantLedgerRow): string {
  return buyLotDay(row);
}

/** NZD per 1 unit, read the same way the book reads a stored rate. */
function fxUsed(currency: string, fxRate: unknown): number | null {
  if (currency === "NZD") return 1;
  const fx = typeof fxRate === "number" ? fxRate : Number(fxRate);
  if (!(fx > 0) || !Number.isFinite(fx)) return null;
  if (currency === "USD" && fx < 1) return 1 / fx;
  return fx;
}

function rowCurrency(row: AccountantLedgerRow): string {
  const stored = String(row.fill_currency || row.currency || "").trim().toUpperCase();
  if (stored === "NZD" || stored === "USD" || stored === "AUD") return stored;
  return inferTradeCurrency(String(row.ticker || ""), row.asset_type, row.fx_rate) || "";
}

function feesNzdCell(row: AccountantLedgerRow, currency: string): string {
  if (typeof row.fees_nzd === "number" && Number.isFinite(row.fees_nzd)) return moneyCell(row.fees_nzd);
  if (typeof row.fees !== "number" || !Number.isFinite(row.fees)) return "";
  if (row.fees === 0) return moneyCell(0);
  if (currency === "NZD") return moneyCell(row.fees);
  const fx = fxUsed(currency, row.fx_rate);
  if (fx == null) return "";
  return moneyCell(row.fees * fx);
}

function cashCell(row: AccountantLedgerRow): string {
  if (typeof row.cash_nzd === "number" && Number.isFinite(row.cash_nzd)) return moneyCell(row.cash_nzd);
  if (typeof row.total === "number" && Number.isFinite(row.total)) return moneyCell(row.total);
  return "";
}

function priceDayOf(mark: StoredPrice | null): string {
  if (!mark?.asOf) return "";
  return lotCivilDay(mark.asOf, "");
}

function holdingCells(pos: SnapshotPosition, mark: StoredPrice | null, asOf: string): string[] {
  const lots = pos.lots.filter((lot) => lot.quantity > 1e-12 && lot.fx != null && lot.fx > 0);
  const rated = lots
    .map((lot) => ({ date: lot.acquired, fx: lot.fx as number }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.fx - b.fx);
  const detail = rated.map((lot) => `${lot.date} ${formatFxInput(lot.fx)}`).join("; ");
  const rates: number[] = [];
  for (const lot of rated) {
    if (!rates.some((rate) => Math.abs(rate - lot.fx) < 1e-9)) rates.push(lot.fx);
  }
  const dates = [...new Set(rated.map((lot) => lot.date))];
  const priceDay = priceDayOf(mark);
  const price = mark && typeof mark.price === "number" && mark.price > 0 ? mark.price : null;
  const notes: string[] = [];
  if (pos.costBase.value == null) notes.push("Cost basis is blank because a lot has no stored exchange rate.");
  let market = "";
  let marketFx = "";
  let marketFxDate = "";
  if (price == null) notes.push("No price is stored for this holding.");
  else if (!priceDay) notes.push("A price is stored but its date is not, so market value is blank.");
  else if (priceDay > asOf) notes.push("Stored price is dated after the holdings date, so market value is blank.");
  else if (pos.currency !== "NZD") notes.push("No exchange rate is stored for this price, so market value in NZD is blank.");
  else {
    market = moneyCell(pos.quantity * price);
    marketFx = "1.0000";
    marketFxDate = priceDay;
  }
  return [
    pos.ticker,
    pos.name,
    qtyCell(pos.quantity),
    pos.currency,
    nzdCell(pos.costBase.value),
    rates.length === 1 ? formatFxInput(rates[0]) : "",
    dates.length === 1 ? dates[0] : "",
    detail,
    market,
    marketFx,
    marketFxDate,
    priceDay,
    notes.join(" "),
  ];
}

export function holdingsCsv(rows: readonly AccountantLedgerRow[], marks: readonly StoredPrice[], asOf: string): string {
  const byTicker = new Map<string, StoredPrice>();
  for (const mark of marks) {
    const ticker = String(mark.ticker || "").trim().toUpperCase();
    if (ticker) byTicker.set(ticker, { ...mark, ticker });
  }
  const usable = [...byTicker.values()].flatMap((mark) => {
    const day = priceDayOf(mark);
    if (!(typeof mark.price === "number" && mark.price > 0) || !day || day > asOf) return [];
    return [{ ticker: mark.ticker, price: mark.price, asOf: day, source: mark.source || "Stored holding price" }];
  });
  const snap = buildPortfolioSnapshot({
    rows: rows.filter((row) => {
      const day = rowDay(row);
      return !!day && day <= asOf;
    }),
    marks: usable,
    fxNow: { NZD: 1 },
    fxSourced: true,
    fxSource: "Stored book",
    fxAsOf: asOf,
    asOf,
    priceSource: "Stored holding price",
  });
  const body: string[][] = [];
  for (const group of snap.groups) {
    for (const pos of group.positions) {
      if (pos.closed || !(pos.quantity > 1e-9)) continue;
      body.push(holdingCells(pos, byTicker.get(pos.ticker.toUpperCase()) ?? null, asOf));
    }
  }
  body.sort((a, b) => a[0].localeCompare(b[0]) || a[7].localeCompare(b[7]));
  return csvDoc(HOLDINGS_COLUMNS, body);
}

export function transactionsCsv(rows: readonly AccountantLedgerRow[], from: string, to: string): string {
  const body: string[][] = [];
  for (const row of rows) {
    const type = String(row.type || "").toLowerCase();
    if (!TX_TYPES.has(type)) continue;
    const day = rowDay(row);
    if (!day || day < from || day > to) continue;
    const currency = rowCurrency(row);
    const fx = fxUsed(currency, row.fx_rate);
    const stamped = lotCivilDay(row.fx_timestamp, "");
    body.push([
      day,
      type,
      String(row.ticker || "").trim().toUpperCase(),
      qtyCell(row.quantity),
      csvUnitPrice(row.fill_price ?? row.price),
      currency,
      fx == null ? "" : formatFxInput(fx),
      stamped || day,
      String(row.fx_source || "").trim(),
      feesNzdCell(row, currency),
      cashCell(row),
      String(row._id || ""),
    ]);
  }
  body.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]) || a[2].localeCompare(b[2]) || a[11].localeCompare(b[11]));
  return csvDoc(TRANSACTION_COLUMNS, body);
}

function storedCash(row: AccountantLedgerRow): number | null {
  if (typeof row.cash_nzd === "number" && Number.isFinite(row.cash_nzd)) return row.cash_nzd;
  if (typeof row.total === "number" && Number.isFinite(row.total)) return row.total;
  return null;
}

export function dividendsCsv(rows: readonly AccountantLedgerRow[], from: string, to: string): string {
  const body: string[][] = [];
  for (const row of rows) {
    if (String(row.type || "").toLowerCase() !== "dividend") continue;
    const view = dividendViewFromRow(row as DividendSourceRow);
    const day = lotCivilDay(view.when, "") || rowDay(row);
    if (!day || day < from || day > to) continue;
    const parts = view.parts;
    const nzdDividend = parts?.currency === "NZD";
    const cash = storedCash(row);
    body.push([
      day,
      view.ticker.trim().toUpperCase(),
      parts?.currency || "",
      parts ? formatFxInput(parts.fx) : "",
      parts ? moneyCell(parts.grossNzd) : "",
      parts ? moneyCell(parts.imputationNzd) : "",
      parts && nzdDividend ? moneyCell(parts.withholdingNzd) : "",
      parts && !nzdDividend ? moneyCell(parts.withholdingNzd) : "",
      parts ? moneyCell(parts.netCashNzd) : nzdCell(cash),
      parts ? "stored" : "cash only, no tax breakdown stored",
      view.id,
    ]);
  }
  body.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]) || a[10].localeCompare(b[10]));
  return csvDoc(DIVIDEND_COLUMNS, body);
}

function columnBlock(file: string, columns: readonly string[], definitions: Record<string, string>): string[] {
  return [`${file}`, ...columns.map((column) => `${file} | ${column}: ${definitions[column]}`)];
}

export function accountantReadme(range: AccountantRange, generatedAt: string): string {
  const lines = [
    "AetherForge accountant export",
    ACCOUNTANT_PACK_LABEL,
    "",
    `Generated at: ${generatedAt}`,
    `NZ tax year: ${range.taxYearLabel}`,
    "The New Zealand tax year runs from 1 Apr to 31 Mar.",
    `Holdings as at: ${range.asOf}`,
    `Transactions from: ${range.from}`,
    `Transactions to: ${range.to}`,
    "",
    "Share with accountant: future work. This download is the pack itself.",
    "",
    "Data sources",
    "- Ledger rows saved on your account (buys, sells, dividends, fees, tax and opening balances). The read is capped at 5,000 rows, the same cap as the other book exports. Rows past that cap are not in this pack.",
    "- Holding prices stored on the holding record (the current price and the time it was saved). Market value uses that price only when its date is on or before the holdings date and the holding is in NZD.",
    "- Dividend imputation, RWT and foreign tax are the amounts already stored on the dividend. Nothing is calculated from a tax rate.",
    "- This pack does not include FIF or IR3 calculations.",
    "- Cost basis follows the book's open lots. Sells close the oldest lots first. A stored split or dividend-reinvestment share count is applied when its date is on or before the holdings date.",
    "- An opening balance is included in the holdings cost. It is not repeated in the transactions file.",
    "- A row with no date is left out. A file that contains only its header row had no matching rows.",
    "",
    "NZD amounts use two decimal places, for example 1234.50. Exchange rates use four decimal places, for example 1.7000. A blank cell means the figure was not stored.",
    "",
    "Files",
    "- holdings.csv",
    "- transactions.csv",
    "- dividends.csv",
    "- README.txt",
    "",
    "Column definitions",
    ...columnBlock("holdings.csv", HOLDINGS_COLUMNS, HOLDINGS_DEFINITIONS),
    ...columnBlock("transactions.csv", TRANSACTION_COLUMNS, TRANSACTION_DEFINITIONS),
    ...columnBlock("dividends.csv", DIVIDEND_COLUMNS, DIVIDEND_DEFINITIONS),
    "",
  ];
  return `${lines.join("\n")}\n`;
}

export function buildAccountantPack(input: {
  rows: readonly AccountantLedgerRow[];
  marks?: readonly StoredPrice[];
  range: AccountantRange;
  generatedAt: string;
}): AccountantPack {
  return {
    range: input.range,
    holdings: holdingsCsv(input.rows, input.marks ?? [], input.range.asOf),
    transactions: transactionsCsv(input.rows, input.range.from, input.range.to),
    dividends: dividendsCsv(input.rows, input.range.from, input.range.to),
    readme: accountantReadme(input.range, input.generatedAt),
  };
}

export function accountantPackFilename(endingYear: number): string {
  return `accountant-pack-${endingYear}.zip`;
}

export function buildAccountantZip(pack: AccountantPack, generatedAt: Date): Uint8Array {
  return buildZip(
    [
      { name: "holdings.csv", data: pack.holdings },
      { name: "transactions.csv", data: pack.transactions },
      { name: "dividends.csv", data: pack.dividends },
      { name: "README.txt", data: pack.readme },
    ],
    generatedAt
  );
}
