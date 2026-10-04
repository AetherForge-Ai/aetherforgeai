import { CANONICAL_CRYPTO_IDS } from "@/lib/crypto-ids";

export interface HoldingsCsvRow {
  ticker: string;
  units: number;
  pricePaid: number;
  /** ISO date (YYYY-MM-DD) when the file included a date that parsed. */
  date?: string;
  assetType: "stock" | "crypto";
}

export interface HoldingsCsvResult {
  rows: HoldingsCsvRow[];
  errors: string[];
}

const TICKER_KEYS = ["ticker", "symbol", "code", "instrument"];
const UNIT_KEYS = ["units", "unit", "shares", "share", "quantity", "qty", "amount"];
const PRICE_KEYS = [
  "price paid",
  "pricepaid",
  "purchase price",
  "purchase_price",
  "avg cost",
  "average cost",
  "average_cost",
  "cost",
  "price",
];
const DATE_KEYS = ["date", "purchase date", "purchase_date", "bought", "trade date", "trade_date"];
const TYPE_KEYS = ["type", "asset", "asset type", "asset_type"];

function normHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

/** RFC-style CSV split that keeps quoted commas. */
export function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        current += ch;
      }
      continue;
    }
    if (ch === '"') {
      quoted = true;
      continue;
    }
    if (ch === ",") {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  cells.push(current.trim());
  return cells;
}

function headerIndex(headers: string[], keys: string[]): number {
  return headers.findIndex((h) => keys.includes(h));
}

/** NZ-first. ISO stays ISO. D/M/YYYY is day then month. */
export function parseHoldingsDate(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (iso) {
    const y = Number(iso[1]);
    const m = Number(iso[2]);
    const d = Number(iso[3]);
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    return `${iso[1]}-${iso[2]}-${iso[3]}`;
  }
  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  if (!dmy) return null;
  const d = Number(dmy[1]);
  const m = Number(dmy[2]);
  const y = dmy[3];
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function parseNumber(raw: string): number | null {
  const cleaned = raw.trim().replace(/[$,\s]/g, "").replace(/NZ\$|US\$|AU\$/gi, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function assetTypeFor(ticker: string, explicit: string | undefined): "stock" | "crypto" {
  const flag = (explicit ?? "").trim().toLowerCase();
  if (flag === "crypto" || flag === "coin") return "crypto";
  if (flag === "stock" || flag === "equity" || flag === "share") return "stock";
  return CANONICAL_CRYPTO_IDS[ticker] ? "crypto" : "stock";
}

/**
 * Holdings import. Required columns: ticker, units, price paid.
 * A date column is kept when the cell parses. It is not required.
 */
export function parseHoldingsCsv(text: string): HoldingsCsvResult {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));

  const errors: string[] = [];
  if (!lines.length) return { rows: [], errors: ["The file is empty."] };

  const first = splitCsvLine(lines[0]).map(normHeader);
  const tickerAt = headerIndex(first, TICKER_KEYS);
  const hasHeader = tickerAt >= 0;
  const headers = hasHeader ? first : ["ticker", "units", "price paid", "date"];
  const body = hasHeader ? lines.slice(1) : lines;

  const unitAt = headerIndex(headers, UNIT_KEYS);
  const priceAt = headerIndex(headers, PRICE_KEYS);
  const dateAt = headerIndex(headers, DATE_KEYS);
  const typeAt = headerIndex(headers, TYPE_KEYS);
  const resolvedTicker = headerIndex(headers, TICKER_KEYS);

  if (resolvedTicker < 0 || unitAt < 0 || priceAt < 0) {
    return {
      rows: [],
      errors: ["The file needs columns for ticker, units, and price paid."],
    };
  }

  const rows: HoldingsCsvRow[] = [];
  body.forEach((line, index) => {
    const cells = splitCsvLine(line);
    const rowNo = hasHeader ? index + 2 : index + 1;
    const ticker = (cells[resolvedTicker] ?? "").trim().toUpperCase();
    const units = parseNumber(cells[unitAt] ?? "");
    const pricePaid = parseNumber(cells[priceAt] ?? "");
    const dateRaw = dateAt >= 0 ? (cells[dateAt] ?? "").trim() : "";
    if (!ticker && units == null && pricePaid == null && !dateRaw) return;
    if (!ticker) {
      errors.push(`Row ${rowNo}: missing ticker.`);
      return;
    }
    if (!(units != null && units > 0)) {
      errors.push(`Row ${rowNo}: units must be greater than 0.`);
      return;
    }
    if (!(pricePaid != null && pricePaid > 0)) {
      errors.push(`Row ${rowNo}: price paid must be greater than 0.`);
      return;
    }
    let date: string | undefined;
    if (dateRaw) {
      const parsed = parseHoldingsDate(dateRaw);
      if (!parsed) {
        errors.push(`Row ${rowNo}: could not read the date "${dateRaw}".`);
        return;
      }
      date = parsed;
    }
    rows.push({
      ticker,
      units,
      pricePaid,
      date,
      assetType: assetTypeFor(ticker, typeAt >= 0 ? cells[typeAt] : undefined),
    });
  });

  if (!rows.length && !errors.length) errors.push("No holdings were found in the file.");
  return { rows, errors };
}
