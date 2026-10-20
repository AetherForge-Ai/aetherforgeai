/**
 * Broker transaction import.
 * Sharesies, Hatch, and IBKR activity files, plus a generic column map.
 * Splits and other corporate actions are listed and not written.
 * A foreign row with no exchange rate uses a reviewed rate for that trade date when one is supplied.
 * No rate is guessed. A company name is used only when it matches one listing.
 *
 * pull-check:batch2-2026-10-11 B2-1
 * pull-check:batch2-fixes-2026-10-12
 * pull-check:v3-retest9-2026-10-12
 * pull-check:v3-dash1-2026-10-13
 */

import { tickersForCompanyName } from "@/lib/broker-names";
import { coinDisplayName } from "@/lib/crypto-names";
import { roundMoney } from "@/lib/currency";
import { parseHoldingsDate, splitCsvLine, splitHoldingsTicker } from "@/lib/holdings-csv";
import { knownImportSymbol } from "@/lib/import-symbols";

export type ImportBroker =
  | "sharesies"
  | "hatch"
  | "kernel"
  | "stake"
  | "ibkr"
  | "asb"
  | "jarden"
  | "commsec"
  | "swyftx"
  | "binance"
  | "easycrypto"
  | "investnow"
  | "aetherforge"
  | "generic";
export type BrokerConfidence = "high" | "medium" | "low";

export interface BrokerDetection {
  broker: ImportBroker | null;
  /** Shown on the review, for example Sharesies. */
  label: string;
  confidence: BrokerConfidence;
  /** 0 to 1. High is a distinctive header set. */
  score: number;
}
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
  /** Where the NZD rate came from. */
  fxSource: "file" | "reviewed-trade-date" | "nzd";
  /** Shown on the review. A reviewed trade-date rate is labelled as such. */
  fxLabel: string;
  /** Quantity times price, in the trade currency, to the cent. */
  nativeValue: number;
  /** Native value plus fee, converted to NZ$. */
  costNzd: number;
  /** NZ$ cash movement. A buy is negative. A sell is the proceeds. */
  cashEffectNzd: number;
  /** Broker order id when the file has one. Empty when it does not. */
  brokerRef: string;
  /** Full name when the file or the coin list has one. */
  assetName?: string;
  /** ISO instant when the file kept a clock. The date column stays the civil day. */
  executedAt?: string;
}

export interface FxNeed {
  currency: "USD" | "AUD";
  date: string;
}

export interface UnsupportedRow {
  line: number;
  reason: string;
  ticker?: string;
  date?: string;
  side?: string;
  quantity?: number;
  price?: number;
}

export interface ImportPlan {
  broker: ImportBroker | null;
  detection: BrokerDetection;
  error: string | null;
  headers: string[];
  /** True when the file has a header row but no broker shape and no complete map. */
  needsMapping: boolean;
  /** True when the file is empty or not a CSV. A readable CSV is not unreadable. */
  unreadable: boolean;
  /** Foreign rows that had no rate in the file. The route looks these up and plans again. */
  fxNeeds: FxNeed[];
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

const SIDE_KEYS = ["side", "type", "action", "buy/sell", "buy sell", "transaction type", "transaction", "event", "order type"];
const TICKER_KEYS = [
  "ticker",
  "symbol",
  "code",
  "instrument code",
  "instrument",
  "instrumentcode",
  "instrument name",
  "company name",
  "company",
  "security name",
  "security code",
  "security",
  "asset",
  "name",
];
const NAME_HEADERS = new Set(["instrument name", "company name", "company", "security name", "name", "asset name", "assetname"]);
const DATE_KEYS = ["date", "trade date", "tradedate", "when", "trade_date"];
const QTY_KEYS = ["quantity", "qty", "units", "shares", "volume"];
const PRICE_KEYS = ["price", "fill price", "fillprice", "tradeprice", "trade price", "t. price", "unit price", "price paid", "pricepaid", "purchase price", "average price", "avg price"];
const FEE_KEYS = ["fee", "fees", "fees native", "feesnative", "commission", "ibcommission", "ib commission", "transaction fee", "brokerage"];
const MARKET_KEYS = ["market code", "market", "exchange"];
const CCY_KEYS = ["currency", "fill currency", "fillcurrency", "currencyprimary", "currency primary", "ccy"];
const FX_KEYS = ["fx", "fx rate", "fxrate", "fxratetobase", "exchange rate"];
const VALUE_KEYS = ["value", "amount", "proceeds", "consideration", "gross value"];
const REF_KEYS = ["order id", "orderid", "reference", "trade id", "broker ref", "contract note", "confirmation number", "transaction id"];
const BROKER_LABEL: Record<ImportBroker, string> = {
  sharesies: "Sharesies",
  hatch: "Hatch",
  kernel: "Kernel",
  stake: "Stake",
  ibkr: "IBKR",
  asb: "ASB Securities",
  jarden: "Jarden Direct",
  commsec: "CommSec",
  swyftx: "Swyftx",
  binance: "Binance",
  easycrypto: "Easy Crypto",
  aetherforge: "AetherForge",
  investnow: "InvestNow (column map; real layout unverified)",
  generic: "Generic",
};

const GENERIC_DETECTION: BrokerDetection = { broker: null, label: "Generic", confidence: "low", score: 0.15 };

function detectionOf(broker: ImportBroker, confidence: BrokerConfidence, score: number): BrokerDetection {
  return { broker, label: BROKER_LABEL[broker], confidence, score };
}
const KNOWN_HEADERS = new Set([
  ...SIDE_KEYS,
  ...TICKER_KEYS,
  ...DATE_KEYS,
  ...QTY_KEYS,
  ...PRICE_KEYS,
  ...FEE_KEYS,
  ...CCY_KEYS,
  ...FX_KEYS,
  ...VALUE_KEYS,
  ...MARKET_KEYS,
  "order id",
]);

/** BOM, quotes, non-breaking spaces, case and repeated spaces all become one comparable header. */
export function normHeader(value: string): string {
  return value
    .replace(/\uFEFF/g, "")
    .replace(/[\u201C\u201D\u2018\u2019]/g, "")
    .replace(/["']/g, "")
    .replace(/\u00A0/g, " ")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function parseImportDate(raw: string): string | null {
  const iso = parseHoldingsDate(raw);
  if (iso) return iso;
  const compact = /^(\d{4})(\d{2})(\d{2})$/.exec(raw.trim());
  if (!compact) return null;
  return parseHoldingsDate(`${compact[1]}-${compact[2]}-${compact[3]}`);
}

const IMPORT_MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function aucklandWallToIso(year: number, month: number, day: number, hour: number, minute: number): string {
  const utc = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const parts = new Intl.DateTimeFormat("en-NZ", {
    timeZone: "Pacific/Auckland",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(utc);
  const read = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  const shown = Date.UTC(read("year"), read("month") - 1, read("day"), read("hour"), read("minute"));
  return new Date(utc.getTime() - (shown - utc.getTime())).toISOString();
}

/** Clock from an export cell such as "13 Oct 2026, 6:50 am", or an ISO instant. */
export function parseImportClock(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(text)) {
    const date = new Date(text);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  const named = /^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4}),\s*(\d{1,2}):(\d{2})\s*([ap]m)/i.exec(text);
  if (!named) return null;
  const month = IMPORT_MONTHS.indexOf(named[2].slice(0, 3).toLowerCase()) + 1;
  const day = Number(named[1]);
  const year = Number(named[3]);
  let hour = Number(named[4]);
  const minute = Number(named[5]);
  const pm = named[6].toLowerCase().startsWith("p");
  if (month < 1 || day < 1 || day > 31 || hour < 1 || hour > 12 || minute < 0 || minute > 59) return null;
  if (hour === 12) hour = pm ? 12 : 0;
  else if (pm) hour += 12;
  return aucklandWallToIso(year, month, day, hour, minute);
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

function hasHeader(headers: string[], name: string): boolean {
  return headers.includes(name);
}

function hasOrderId(headers: string[]): boolean {
  return headers.some((header) => header === "order id" || header.endsWith(" order id"));
}

/** Header shape only. A Sharesies file is Sharesies, with a confidence level. */
export function detectBroker(headers: string[]): BrokerDetection {
  if (
    (hasHeader(headers, "datetime nz") || hasHeader(headers, "datetimenz")) &&
    (hasHeader(headers, "fill price") || hasHeader(headers, "fillprice")) &&
    (hasHeader(headers, "execution status") || hasHeader(headers, "executionstatus"))
  ) {
    return detectionOf("aetherforge", "high", 0.99);
  }
  if (hasHeader(headers, "instrument code") || hasHeader(headers, "instrument name")) {
    return detectionOf("sharesies", "high", 0.96);
  }
  if (hasOrderId(headers) && (hasHeader(headers, "trade date") || hasHeader(headers, "transaction type") || hasHeader(headers, "market code"))) {
    return detectionOf("sharesies", "high", 0.9);
  }
  if (hasHeader(headers, "transaction type") && hasHeader(headers, "market code") && (hasHeader(headers, "trade date") || hasHeader(headers, "date"))) {
    return detectionOf("sharesies", "high", 0.92);
  }
  if ((hasHeader(headers, "company") || hasHeader(headers, "company name")) && hasHeader(headers, "type")) {
    return detectionOf("sharesies", "medium", 0.74);
  }
  // Goal b8 H-10: NZ and AU brokers by header signature, ahead of the generic Buy/Sell match.
  if (hasHeader(headers, "contract note") && hasHeader(headers, "security code")) return detectionOf("asb", "high", 0.93);
  if (hasHeader(headers, "confirmation number") && hasHeader(headers, "brokerage") && hasHeader(headers, "exchange")) {
    return detectionOf("jarden", "high", 0.92);
  }
  if (hasHeader(headers, "settlement date") && hasHeader(headers, "average price") && hasHeader(headers, "security")) {
    return detectionOf("commsec", "high", 0.92);
  }
  if (
    headers.some((header) => header.includes("swyftx")) ||
    (hasHeader(headers, "event") && hasHeader(headers, "asset") && hasHeader(headers, "transaction id"))
  ) {
    return detectionOf("swyftx", "high", 0.93);
  }
  if (hasHeader(headers, "clientaccountid") || hasHeader(headers, "buy/sell")) return detectionOf("ibkr", "high", 0.95);
  if (hasHeader(headers, "trade date") && hasHeader(headers, "action") && hasHeader(headers, "symbol")) {
    return detectionOf("hatch", "high", 0.94);
  }
  if (headers.some((header) => header.includes("kernel")) || hasHeader(headers, "fund name")) {
    return detectionOf("kernel", "high", 0.91);
  }
  if (hasHeader(headers, "fund") && hasHeader(headers, "units") && (hasHeader(headers, "amount") || hasHeader(headers, "price"))) {
    return detectionOf("kernel", "medium", 0.7);
  }
  if (
    headers.some((header) => header === "stake" || header.includes("stake id")) ||
    (hasHeader(headers, "brokerage") && hasHeader(headers, "symbol") && (hasHeader(headers, "side") || hasHeader(headers, "units")))
  ) {
    return detectionOf("stake", "high", 0.9);
  }
  if (
    headers.some((header) => header.includes("binance")) ||
    hasHeader(headers, "utc time") ||
    (hasHeader(headers, "pair") && hasHeader(headers, "executed"))
  ) {
    return detectionOf("binance", "high", 0.93);
  }
  if (
    headers.some((header) => header.includes("easy crypto") || header.includes("easycrypto")) ||
    (hasHeader(headers, "from currency") && hasHeader(headers, "to currency"))
  ) {
    return detectionOf("easycrypto", "high", 0.93);
  }
  return { ...GENERIC_DETECTION };
}

/** NZX and ASX market codes become a suffix. A code that already has one is left alone. */
export function withMarketSuffix(ticker: string, marketRaw: string): string {
  const code = ticker.trim().toUpperCase();
  if (!code || /\.(NZ|AX)$/.test(code)) return code;
  const market = marketRaw.trim().toUpperCase().replace(/\s+/g, "");
  if (market === "NZX" || market === "NZ" || market === "NZSX") return `${code}.NZ`;
  if (market === "ASX" || market === "AX" || market === "AU") return `${code}.AX`;
  return code;
}

/** Prefill the column map from headers the file already has. */
export function suggestedColumnMap(headers: string[]): Record<string, string> {
  const normalised = headers.map((header) => ({ raw: header, key: normHeader(header) }));
  const pick = (keys: string[]) => normalised.find((header) => keys.includes(header.key))?.raw || "";
  return {
    date: pick(DATE_KEYS),
    ticker: pick(TICKER_KEYS),
    side: pick(SIDE_KEYS),
    quantity: pick(QTY_KEYS),
    price: pick(PRICE_KEYS),
    fee: pick(FEE_KEYS),
    currency: pick(CCY_KEYS),
    fx: pick(FX_KEYS),
    value: pick(VALUE_KEYS),
  };
}

/**
 * The import response puts needsMapping on the plan and, for a map-only preview, on the root.
 * The column screen renders when either one is set.
 */
export function readImportPreview(body: {
  needsMapping?: boolean;
  data?: { needsMapping?: boolean; headers?: string[] } | null;
} | null | undefined): { needsMapping: true; headers: string[] } | null {
  if (!body) return null;
  const flagged = body.needsMapping === true || body.data?.needsMapping === true;
  if (!flagged) return null;
  const headers = Array.isArray(body.data?.headers) ? body.data.headers.filter((header) => typeof header === "string") : [];
  return { needsMapping: true, headers };
}

const TICKER_SHAPED = /^[A-Z0-9][A-Z0-9.-]{0,14}$/;

function isTickerShaped(value: string): boolean {
  const text = value.trim();
  if (!text || /\s/.test(text)) return false;
  return TICKER_SHAPED.test(text.toUpperCase());
}

function narrowTickers(tickers: string[], currency: ImportCurrency | null): string[] {
  if (!currency || tickers.length < 2) return tickers;
  const picked =
    currency === "NZD"
      ? tickers.filter((ticker) => ticker.endsWith(".NZ"))
      : currency === "AUD"
        ? tickers.filter((ticker) => ticker.endsWith(".AX"))
        : tickers.filter((ticker) => !ticker.includes("."));
  return picked.length === 1 ? picked : tickers;
}

/**
 * A code in the file is kept, including `CODE / NAME`.
 * APPL stays APPL. A company name with no code is used only when one listing matches.
 */
function resolveTicker(raw: string, currency: ImportCurrency | null): { ticker: string } | { reason: string } {
  const text = raw.trim();
  if (!text) return { reason: "Date, ticker, quantity or price could not be read." };
  const split = splitHoldingsTicker(text);
  if (split) return { ticker: split.code };
  if (isTickerShaped(text)) return { ticker: text.toUpperCase() };
  const matches = tickersForCompanyName(text);
  if (!matches.length) {
    return { reason: `Company name "${text}" is not on the stock list. Nothing was guessed.` };
  }
  const narrowed = narrowTickers(matches, currency);
  if (narrowed.length === 1) return { ticker: narrowed[0] };
  return {
    reason: `Company name "${text}" matches ${narrowed.join(", ")}. Choose one ticker. Nothing was guessed.`,
  };
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

function emptyPlan(
  error: string | null,
  headers: string[] = [],
  unreadable = false,
  detection: BrokerDetection = { ...GENERIC_DETECTION }
): ImportPlan {
  return {
    broker: detection.broker,
    detection,
    error,
    headers,
    needsMapping: false,
    unreadable,
    fxNeeds: [],
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

function headerScore(cells: string[]): number {
  return cells.filter((header) => KNOWN_HEADERS.has(header)).length;
}

/** First line in the opening rows that looks like column names. A preamble is skipped. */
function locateHeader(lines: string[]): number {
  const limit = Math.min(lines.length, 40);
  let fallback = -1;
  for (let i = 0; i < limit; i++) {
    const cells = splitCsvLine(lines[i]).map(normHeader).filter(Boolean);
    if (cells.length < 2) continue;
    if (fallback < 0) fallback = i;
    if (headerScore(cells) >= 3) return i;
  }
  return fallback;
}

function fxNeedKey(currency: string, date: string): string {
  return `${currency}|${date}`;
}

/** Shown with every paper deposit. Cash goes up. XIRR treats the deposit as money added. */
export const FUNDING_DISCLOSURE =
  "A paper deposit adds that amount to paper cash. It is not money from the broker file. XIRR counts a deposit as money you added, so the money-weighted return changes.";

function addTotal(bag: Record<string, number>, currency: string, amount: number) {
  bag[currency] = roundMoney((bag[currency] || 0) + amount);
}

/** Stable hash of date, type, ticker, quantity, price and broker ref. */
export function importRowHash(row: {
  date: string;
  ticker: string;
  side: string;
  quantity: number;
  price: number;
  brokerRef?: string;
}): string {
  const payload = [
    row.date,
    row.side.trim().toLowerCase(),
    row.ticker.trim().toUpperCase(),
    Number(row.quantity).toFixed(8),
    Number(row.price).toFixed(8),
    (row.brokerRef || "").trim(),
  ].join("|");
  let h1 = 0x811c9dc5;
  let h2 = 0x811c9dc5 ^ 0x9e3779b9;
  for (let i = 0; i < payload.length; i++) {
    const code = payload.charCodeAt(i);
    h1 ^= code;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= code;
    h2 = Math.imul(h2, 0x01000193);
  }
  return `${(h1 >>> 0).toString(16).padStart(8, "0")}${(h2 >>> 0).toString(16).padStart(8, "0")}`;
}

export function importDuplicateKey(row: {
  date: string;
  ticker: string;
  side: string;
  quantity: number;
  price: number;
  brokerRef?: string;
}): string {
  return importRowHash(row);
}

export function brokerRefFromNotes(notes: string | null | undefined): string {
  const match = String(notes || "").match(/(?:^|\s)ref=(\S+)/);
  return match?.[1] || "";
}

function unsupportedRowReason(sideRaw: string): string {
  const side = sideRaw.trim().toLowerCase();
  const label = sideRaw.trim() || "blank type";
  if (side === "deposit" || side === "withdrawal") {
    return `Unsupported row (${label}). Deposits and withdrawals are not imported.`;
  }
  if (side === "split") return `Unsupported row (${label}). Splits are not imported.`;
  return `Unsupported row (${label}). This row type is not imported.`;
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
 * `existingKeys` are duplicate hashes already on the book.
 * The same hash inside this file is a duplicate and is skipped. A broker ref keeps two fills apart.
 * `openingCashNzd` is the paper cash available before this file.
 * `fundBuys` is off unless it is exactly true. A buy that would make paper cash negative is then skipped and listed.
 * An error plan writes nothing: no trades and no funding deposit.
 */
/**
 * b51 H-10 (TT b31: CommSec/Jarden/Swyftx/Easy Crypto/Hatch files in the documented export layouts
 * gave an empty preview or "not recognised"). BROKER-CSV-COLUMNS.md: Hatch and Swyftx headers are
 * verified (Hatch Help Centre; Cryptact Swyftx spec); CommSec Confirmations, Jarden and Easy Crypto are
 * the documented-but-unverified layouts. Each known export layout is rewritten into the column layout
 * this parser already reads, row by row, before planning. Values are copied, never invented: a column
 * the export does not carry stays blank (an FX rate is then looked up as for any other file).
 */
type LayoutRow = Record<string, string>;
const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
function aucklandDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Pacific/Auckland", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
function mul(a: string, b: string): string {
  const x = parseNumber(a);
  const y = parseNumber(b);
  return x != null && y != null ? String(Math.round(x * y * 1e8) / 1e8) : "";
}
const KNOWN_LAYOUTS: Array<{
  name: string;
  match: (h: string[]) => boolean;
  header: string[];
  row: (r: LayoutRow) => string[] | null;
}> = [
  {
    name: "hatch-help-centre",
    match: (h) => h.includes("date (nz)") && h.includes("side") && h.includes("price (usd)"),
    header: ["Trade Date", "Action", "Symbol", "Quantity", "Price", "Commission", "Currency", "FX Rate", "Value"],
    row: (r) => [r["date (nz)"], r["side"], r["symbol"], r["quantity"], r["price (usd)"], r["brokerage fees (usd)"] ?? "", "USD", r["fx rate"] ?? "", mul(r["quantity"], r["price (usd)"])],
  },
  {
    name: "swyftx-transaction-report",
    match: (h) => h.includes("event") && h.includes("asset") && h.includes("amount") && h.includes("rate") && h.includes("transaction id"),
    header: ["Date", "Event", "Asset", "Quantity", "Price", "Fee", "Currency", "Transaction ID"],
    row: (r) => [r["date"], r["event"], r["asset"], r["amount"], r["rate"], r["fee amount"] ?? "", r["currency"] ?? "", r["transaction id"] ?? ""],
  },
  {
    name: "commsec-confirmations",
    match: (h) => h.includes("confirmation number") && h.includes("average price ($)") && h.includes("security"),
    header: ["Trade Date", "Settlement Date", "Reference", "Security", "Buy/Sell", "Units", "Average Price", "Brokerage", "Currency", "FX Rate"],
    row: (r) => [r["trade date"], r["settlement date"] ?? "", r["confirmation number"] ?? "", withMarketSuffix(r["security"], "ASX"), r["buy/sell"], r["units"], r["average price ($)"], r["brokerage (inc gst.)"] ?? "", "AUD", ""],
  },
  {
    name: "jarden-transactions",
    match: (h) => h.includes("transaction date") && h.includes("confirmation number") && h.includes("code") && h.includes("type"),
    header: ["Date", "Code", "Exchange", "Transaction", "Units", "Price", "Brokerage", "Currency", "Confirmation Number"],
    row: (r) => [r["transaction date"], r["code"], r["exchange"] ?? "", r["type"], r["quantity"], r["price"], r["brokerage"] ?? "", r["currency"] ?? "", r["confirmation number"] ?? ""],
  },
  {
    name: "easycrypto-orders",
    match: (h) => h.includes("from currency") && h.includes("to currency") && h.includes("side"),
    header: ["Date", "Type", "Symbol", "Quantity", "Price", "Fee", "Currency", "Easy Crypto Order ID"],
    row: (r) => {
      // Only completed orders are trades; a pending or cancelled order is not imported.
      if (r["status"] && !/^complete/i.test(r["status"])) return null;
      const buy = /^buy/i.test(r["side"] || "");
      const coin = buy ? r["to currency"] : r["from currency"];
      const qty = buy ? r["to amount"] : r["from amount"];
      const ccy = buy ? r["from currency"] : r["to currency"];
      return [aucklandDay(r["created"]), r["side"], coin, qty, r["rate"], r["fee"] ?? "", ccy, r["order id"] ?? ""];
    },
  },
];
/** The rewritten lines and the layout name, or the lines unchanged. */
export function rewriteKnownLayout(lines: string[]): { lines: string[]; layout: string | null } {
  const at = locateHeader(lines);
  if (at < 0) return { lines, layout: null };
  const head = splitCsvLine(lines[at]).map(normHeader);
  const layout = KNOWN_LAYOUTS.find((l) => l.match(head));
  if (!layout) return { lines, layout: null };
  const out = [layout.header.join(",")];
  for (const line of lines.slice(at + 1)) {
    const cells = splitCsvLine(line);
    if (cells.every((c) => !c.trim())) continue;
    const r: LayoutRow = {};
    head.forEach((h, i) => (r[h] = (cells[i] ?? "").trim()));
    const row = layout.row(r);
    if (row) out.push(row.map((v) => csvCell(v ?? "")).join(","));
  }
  return { lines: [...lines.slice(0, at), ...out], layout: layout.name };
}

/** BS-02: a title row such as "InvestNow - General Ledger Report" above the header row. */
export function isInvestNowPreamble(preamble: readonly string[]): boolean {
  return preamble.some((line) => /invest\s*now/i.test(line));
}

export function planBrokerImport(
  text: string,
  options?: {
    mapping?: ColumnMap;
    existingKeys?: Iterable<string>;
    openingCashNzd?: number;
    /** True records a paper deposit so a buy does not make cash negative. Off unless exactly true. */
    fundBuys?: boolean;
    /** Reviewed NZD per 1 unit for `${currency}|YYYY-MM-DD`. Null means the lookup had no rate. */
    reviewedRates?: Record<string, number | null>;
    /** Line number to a ticker the member typed. A blank fix is ignored. Nothing is substituted on its own. */
    tickerFixes?: Record<string, string>;
    /** BS-02: the member picked a broker whose layout has no fixed header (InvestNow). */
    broker?: "investnow";
  }
): ImportPlan {
  const lines = rewriteKnownLayout(linesOf(text || "")).lines;
  if (!lines.length) return emptyPlan("The file is empty. Nothing was written.", [], true);

  const headerAt = locateHeader(lines);
  if (headerAt < 0) return emptyPlan("This file is not a CSV of trades. Nothing was written.", [], true);

  const headerCells = splitCsvLine(lines[headerAt]).map(normHeader);

  // BS-02: InvestNow has no documented CSV; its General Ledger Report (.xlsx, or a CSV saved from it)
  // goes through the generic column map. Headers are UNKNOWN, so it is chosen in the picker or named in
  // a title row above the header; it is never guessed from column names.
  const investNow = options?.broker === "investnow" || isInvestNowPreamble(lines.slice(0, headerAt));
  const detection = investNow ? detectionOf("investnow", "low", 0.5) : detectBroker(headerCells);
  const broker = detection.broker;
  const columns = mapFromHeaders(headerCells, options?.mapping);
  const holdingsShape = columns.side < 0 && columns.ticker >= 0 && columns.quantity >= 0 && columns.price >= 0;
  const required = [columns.date, columns.ticker, columns.side, columns.quantity, columns.price];
  if (required.some((at) => at < 0) && !holdingsShape) {
    const plan = emptyPlan(null, headerCells, false, detection);
    plan.needsMapping = true;
    plan.error = "Choose the date, ticker, side, quantity and price columns. Nothing was written.";
    return plan;
  }

  const storedCounts = countKeys(options?.existingKeys || []);
  const rows: ImportTrade[] = [];
  const unsupported: UnsupportedRow[] = [];
  const sourceTotals: Record<string, number> = {};
  const fxNeeds: FxNeed[] = [];
  const seenNeeds = new Set<string>();
  const nameAt = indexOf(headerCells, [...NAME_HEADERS]);
  const marketAt = indexOf(headerCells, MARKET_KEYS);
  const refAt = indexOf(headerCells, REF_KEYS);

  lines.slice(headerAt + 1).forEach((line, index) => {
    const lineNo = headerAt + index + 2;
    const cells = splitCsvLine(line);
    const blank = cells.every((cell) => !cell.trim());
    if (blank) return;

    const sideRaw = holdingsShape ? "buy" : cells[columns.side] || "";
    const side = holdingsShape ? "buy" : parseSide(sideRaw);
    if (side === "unsupported") {
      unsupported.push({ line: lineNo, reason: unsupportedRowReason(sideRaw) });
      return;
    }
    if (side == null) {
      unsupported.push({ line: lineNo, reason: `Side "${sideRaw.trim()}" is not a buy or a sell.` });
      return;
    }

    const date = parseImportDate(cells[columns.date] || "");
    const quantityRaw = parseNumber(cells[columns.quantity] || "");
    let price = parseNumber(cells[columns.price] || "");
    const currencyCell = columns.currency >= 0 ? cells[columns.currency] || "" : "";
    const currencyHint = ["NZD", "AUD", "USD"].includes(currencyCell.trim().toUpperCase())
      ? (currencyCell.trim().toUpperCase() as ImportCurrency)
      : null;
    let tickerRaw = cells[columns.ticker] || "";
    const tickerHeader = headerCells[columns.ticker] || "";
    let named = NAME_HEADERS.has(tickerHeader);
    if (!tickerRaw.trim() && nameAt >= 0 && nameAt !== columns.ticker) {
      tickerRaw = cells[nameAt] || "";
      named = true;
    }
    if (!date || quantityRaw == null || !tickerRaw.trim()) {
      unsupported.push({ line: lineNo, reason: "Date, ticker, quantity or price could not be read." });
      return;
    }
    const resolved = named || !isTickerShaped(tickerRaw) ? resolveTicker(tickerRaw, currencyHint) : { ticker: tickerRaw.trim().toUpperCase() };
    if ("reason" in resolved) {
      unsupported.push({ line: lineNo, reason: resolved.reason });
      return;
    }
    const printed = marketAt >= 0 ? withMarketSuffix(resolved.ticker, cells[marketAt] || "") : resolved.ticker;
    const fix = (options?.tickerFixes?.[String(lineNo)] || "").trim().toUpperCase();
    const ticker = fix || printed;
    const quantity = Math.abs(quantityRaw);
    // Goal b8 H-10: a negative quantity on a buy is an error, not a silent flip.
    // (IBKR prints sells as negative quantities; those stay valid.)
    if (quantityRaw < 0 && side === "buy") {
      unsupported.push({ line: lineNo, ticker, date, side, quantity: quantityRaw, reason: "Negative quantity on a buy. Fix the row or leave it out." });
      return;
    }
    if (!(price != null && price > 0)) {
      unsupported.push({
        line: lineNo,
        ticker,
        date,
        side,
        quantity,
        reason: "Price required — the file has no price for this row.",
      });
      return;
    }
    if (!(quantity > 0)) {
      unsupported.push({
        line: lineNo,
        ticker,
        date,
        side,
        quantity,
        price,
        reason: "Quantity and price must be greater than zero.",
      });
      return;
    }

    const currency = currencyOf(columns.currency >= 0 ? cells[columns.currency] || "" : "", ticker);
    if (!currency) {
      unsupported.push({ line: lineNo, reason: "Currency must be NZD, AUD or USD." });
      return;
    }
    let fx = currency === "NZD" ? 1 : parseNumber(columns.fx >= 0 ? cells[columns.fx] || "" : "");
    if (fx != null && currency === "USD" && fx > 0 && fx < 1) fx = 1 / fx;
    let fxSource: ImportTrade["fxSource"] = currency === "NZD" ? "nzd" : "file";
    let fxLabel = currency === "NZD" ? "NZD" : "Rate from the file";
    if (!(fx != null && fx > 0)) {
      if (currency === "USD" || currency === "AUD") {
        const key = fxNeedKey(currency, date);
        const table = options?.reviewedRates;
        if (table && Object.prototype.hasOwnProperty.call(table, key)) {
          const reviewed = table[key];
          if (reviewed != null && reviewed > 0) {
            fx = reviewed;
            fxSource = "reviewed-trade-date";
            fxLabel = "Reviewed rate for the trade date";
          } else {
            unsupported.push({
              line: lineNo,
              reason: "No exchange rate in the file, and no reviewed rate for this trade date. No rate was guessed.",
            });
            return;
          }
        } else {
          if (!seenNeeds.has(key)) {
            seenNeeds.add(key);
            fxNeeds.push({ currency, date });
          }
          unsupported.push({
            line: lineNo,
            reason: "A foreign trade needs the NZD exchange rate from the file. No rate was guessed.",
          });
          return;
        }
      } else {
        unsupported.push({ line: lineNo, reason: "A foreign trade needs the NZD exchange rate from the file. No rate was guessed." });
        return;
      }
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

    const usedFx = currency === "NZD" ? 1 : fx;
    const costNzd = roundMoney((nativeValue + fee) * usedFx);
    if (!knownImportSymbol(ticker)) {
      unsupported.push({
        line: lineNo,
        ticker,
        date,
        side,
        quantity,
        price,
        reason: `Ticker ${ticker} is not on the symbol list. It was left as printed. Fix the ticker or leave this row out.`,
      });
      return;
    }

    const brokerRef = refAt >= 0 ? (cells[refAt] || "").trim().replace(/\s+/g, "") : "";
    const clockAt = indexOf(headerCells, ["datetime nz", "datetimenz"]);
    const executedAt = clockAt >= 0 ? parseImportClock(cells[clockAt] || "") : null;
    const nameCell = nameAt >= 0 ? (cells[nameAt] || "").trim() : "";
    const assetName = coinDisplayName(ticker, nameCell || ticker);
    const cashEffectNzd =
      side === "sell" ? roundMoney(Math.max(0, nativeValue - fee) * usedFx) : roundMoney(-costNzd);
    rows.push({
      line: lineNo,
      date,
      ticker,
      side,
      quantity,
      price,
      fee,
      currency,
      fx: usedFx,
      fxSource,
      fxLabel,
      nativeValue,
      costNzd,
      cashEffectNzd,
      brokerRef,
      assetName,
      ...(executedAt ? { executedAt } : {}),
    });
  });

  if (!rows.length && !unsupported.length) {
    const plan = emptyPlan("No trade rows were found. Nothing was written.", headerCells, false, detection);
    if (!broker && !options?.mapping) plan.needsMapping = true;
    return plan;
  }

  const stored = storedCounts;
  const seenInFile = new Set<string>();
  const duplicates: ImportTrade[] = [];
  const fresh: ImportTrade[] = [];
  for (const row of rows) {
    const key = importDuplicateKey(row);
    if (seenInFile.has(key) || (stored.get(key) || 0) > 0) duplicates.push(row);
    else {
      seenInFile.add(key);
      fresh.push(row);
    }
  }

  const readableButUnmapped = !broker && !options?.mapping && rows.length === 0 && !holdingsShape;
  const fileError = rows.length === 0 && !readableButUnmapped ? "No buy or sell rows could be read. Nothing was written." : null;
  const cash = fileError
    ? { toWrite: [] as ImportTrade[], deposits: [] as ImportPlan["fundingDeposits"], skipped: [] as UnsupportedRow[], fundingNeeded: false }
    : applyCash(fresh, options?.openingCashNzd ?? 0, options?.fundBuys === true);
  const skipped = [...unsupported, ...cash.skipped];
  const importedTotals: Record<string, number> = {};
  for (const row of cash.toWrite) addTotal(importedTotals, row.currency, row.nativeValue);

  const plan: ImportPlan = {
    broker: broker || (rows.length || options?.mapping ? "generic" : detection.broker),
    detection: broker ? detection : { ...detection, broker: rows.length ? "generic" : detection.broker, label: broker ? detection.label : "Generic" },
    error: readableButUnmapped
      ? "Choose the date, ticker, side, quantity and price columns. Nothing was written."
      : fileError,
    headers: headerCells,
    needsMapping: readableButUnmapped,
    unreadable: false,
    fxNeeds,
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
    const sentence = /[.!?]$/.test(listed.trim()) ? listed.trim() : `${listed.trim()}.`;
    parts.push(
      `${plan.unsupported.length} skipped ${plan.unsupported.length === 1 ? "row is" : "rows are"} not in the imported total. ${sentence}`
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

