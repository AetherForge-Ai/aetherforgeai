/**
 * Ledger CSV cells. Money is 2 decimal places, FX is 4, unit prices keep
 * the stored precision (at least 6 decimal places before trailing zeros).
 */

import {
  formatCleanNumber,
  formatDisplayDate,
  formatSavedFx,
  roundMoney,
  roundUnitPrice,
  type CurrencyCode,
} from "@/lib/currency";
import { dexFromLedger, stripDexNotesPrefix } from "@/lib/dex-source";
import { stripDividendNotesPrefix } from "@/lib/dividend-ledger";
import { formatLedgerDateTime } from "@/lib/executed-at";
import { collapseCorrectionNote, ensureCorrectionCurrency } from "@/lib/holding-correction";
import { buyLotDay, ledgerDisplayWhen, movementHasClock } from "@/lib/lot-day";
import { listingExchangeLabel } from "@/lib/market-intel";

export type CsvRow = Record<string, unknown> & {
  type?: string;
  ticker?: string;
  asset_name?: string;
  asset_type?: string;
  quantity?: number;
  price?: number;
  fees?: number;
  total?: number;
  realized_pnl?: number;
  currency?: string;
  notes?: string;
  executed_at?: string;
  createdAt?: string;
};

function num(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export function csvMoney(value: unknown): string {
  const n = num(value);
  if (n == null) return "";
  return roundMoney(n).toFixed(2);
}

/** Full stored precision. Trailing zeros are trimmed. Prices are not collapsed to 2 decimals. */
export function csvUnitPrice(value: unknown): string {
  const n = num(value);
  if (n == null) return "";
  const rounded = roundUnitPrice(n);
  return rounded.toFixed(12).replace(/(\.\d*?[1-9])0+$/, "$1").replace(/\.0+$/, "");
}

export function csvFeesNzd(row: CsvRow): string {
  const stored = num(row.fees_nzd);
  if (stored != null) return csvMoney(stored);
  const fees = num(row.fees_native ?? row.fees);
  if (fees == null) return csvMoney(0);
  const currency = String(row.fill_currency || row.currency || "NZD").toUpperCase();
  if (currency === "NZD") return csvMoney(fees);
  const fx = num(row.fx_rate);
  if (fx == null || !(fx > 0)) return "";
  return csvMoney(fees * fx);
}

export function csvFxSource(row: CsvRow): string {
  const stored = String(row.fx_source ?? "").trim();
  if (stored) return stored;
  const currency = String(row.fill_currency || row.currency || "NZD").toUpperCase();
  return currency === "NZD" ? "nzd" : "daily";
}

const AUDIT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** en-NZ short stamps ("10/10/2026, 10:57:02 pm") become "10 Oct 2026, 10:57 pm". */
export function normaliseAuditDates(notes: string): string {
  return notes.replace(/\[audit (\d{1,2})\/(\d{1,2})\/(\d{4}),\s*([^\]]+)\]/g, (_m, day, month, year, time) => {
    const name = AUDIT_MONTHS[Number(month) - 1];
    const clock = String(time)
      .replace(/(\d{1,2}:\d{2}):\d{2}/, "$1")
      .replace(/\s+/g, " ")
      .trim();
    return `[audit ${Number(day)} ${name || month} ${year}, ${clock}]`;
  });
}

/** live=7476.61570345871 becomes a short decimal, not a binary tail. */
export function cleanNoteFigures(notes: string): string {
  return notes.replace(/live=(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)/gi, (_m, raw: string) => {
    const n = Number(raw);
    return Number.isFinite(n) ? `live=${formatCleanNumber(n)}` : `live=${raw}`;
  });
}

export function csvNotes(row: CsvRow): string {
  const raw = row.notes == null ? "" : String(row.notes);
  const currency = String(row.fill_currency || row.currency || "NZD").toUpperCase() as CurrencyCode;
  let notes = cleanNoteFigures(
    normaliseAuditDates(collapseCorrectionNote(stripDexNotesPrefix(stripDividendNotesPrefix(raw))))
  ).trim();
  if (notes.startsWith("Correction:")) notes = ensureCorrectionCurrency(notes, currency);
  if (notes) return notes;
  if (row.type === "sell") return "Sell recorded on the paper book.";
  return "";
}

function csvText(value: unknown): string {
  return value == null ? "" : String(value);
}

function blank(value: unknown): boolean {
  return value == null || value === "";
}

const CHAIN_BY_TICKER: Record<string, string> = {
  BTC: "Bitcoin",
  ETH: "Ethereum",
  UNI: "Ethereum",
  PEPE: "Ethereum",
  SOL: "Solana",
};

function csvVenue(row: CsvRow, dexVenue: string | null, dexChain: string | null): string {
  const type = String(row.type || "");
  if (type === "deposit" || type === "withdraw" || type === "tax") return "Cash";
  if (dexVenue === "DEX") return dexChain ? `DEX: ${dexChain}` : "DEX";
  const asset = String(row.asset_type || "").toLowerCase();
  if (asset === "crypto") return "CoinGecko";
  if (asset === "metal") return "NZX";
  const listed = listingExchangeLabel(csvText(row.ticker), asset || null);
  if (listed === "NZX" || listed === "ASX" || listed === "NYSE" || listed === "NASDAQ") return listed;
  if (listed === "US") return "NASDAQ";
  return listed || "NZX";
}

function csvChain(row: CsvRow, dexChain: string | null): string {
  if (dexChain) return dexChain;
  const asset = String(row.asset_type || "").toLowerCase();
  if (asset !== "crypto") return "";
  const bare = csvText(row.ticker).trim().toUpperCase().split(".")[0];
  return CHAIN_BY_TICKER[bare] || "not stored";
}

export function transactionCsvCells(row: CsvRow): string[] {
  const when = csvText(row.executed_at || row.createdAt);
  const dex = dexFromLedger({
    venue: typeof row.venue === "string" ? row.venue : null,
    chain: typeof row.chain === "string" ? row.chain : null,
    notes: row.notes == null ? null : String(row.notes),
  });
  const currency = csvText(row.fill_currency || row.currency || "NZD").toUpperCase();
  const notional =
    !blank(row.native_notional)
      ? csvMoney(row.native_notional)
      : !blank(row.quantity) && !blank(row.price)
        ? csvMoney(Number(row.quantity) * Number(row.price))
        : "";
  const priceSource = csvText(row.price_source || "user_fill");
  const cashOnly = row.type === "deposit" || row.type === "withdraw" || row.type === "tax";
  const assetId = csvText(row.asset_id).trim();
  const quoteTime = formatLedgerDateTime(csvText(row.price_as_at));
  const priceAsAt = quoteTime || "not stored";
  const clock = ledgerDisplayWhen(row);
  const isSell = row.type === "sell";
  const markStored = !blank(row.mark_price);
  const fill = row.fill_price ?? row.price;
  const markCell = markStored ? csvUnitPrice(row.mark_price) : !blank(fill) ? csvUnitPrice(fill) : "not stored";
  const priceN = num(row.realized_price_pnl_nzd);
  const fxN = num(row.realized_fx_pnl_nzd);
  const haveSplit = priceN != null && fxN != null;
  const fxRate = currency === "NZD" ? formatSavedFx(row.fx_rate) || "1.0000" : formatSavedFx(row.fx_rate);
  const dataNote = [
    !assetId && cashOnly ? "Cash has no asset id." : "",
    !assetId && !cashOnly && !csvText(row.ticker) ? "No canonical id stored." : "",
    quoteTime ? "" : "Quote time was not stored.",
    markStored ? "" : !blank(fill) ? "Mark is the fill, not a live export price." : "Not marked at export.",
    isSell && !haveSplit ? "Price and FX split was not stored." : "",
    clock && !movementHasClock(clock) ? "time not stored" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return [
    formatDisplayDate(buyLotDay(row) || when) === "—" ? "" : formatDisplayDate(buyLotDay(row) || when),
    clock,
    csvText(row.execution_status || "filled"),
    csvText(row.type),
    csvText(row.ticker),
    csvText(row.asset_name),
    csvText(row.asset_type),
    assetId || (cashOnly ? "" : csvText(row.ticker)),
    blank(row.quantity) ? "" : csvText(row.quantity),
    csvUnitPrice(row.fill_price ?? row.price),
    currency,
    priceSource,
    priceAsAt,
    markCell,
    csvMoney(row.fees_native ?? row.fees ?? 0),
    csvFeesNzd(row),
    notional,
    fxRate,
    csvFxSource(row),
    csvMoney(row.cash_nzd ?? row.total),
    haveSplit ? csvMoney(priceN) : isSell ? "" : csvMoney(0),
    haveSplit ? csvMoney(fxN) : isSell ? "" : csvMoney(0),
    haveSplit ? csvMoney(roundMoney(priceN + fxN)) : isSell ? "" : csvMoney(row.realized_pnl_nzd ?? row.realized_pnl ?? 0),
    csvText(row.order_sizing || "units"),
    csvNotes(row),
    csvVenue(row, dex.venue, dex.chain),
    csvChain(row, dex.chain),
    dataNote,
  ];
}

export function csvEscape(value: unknown): string {
  const s = value == null ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
