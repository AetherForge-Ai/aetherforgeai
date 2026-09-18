/**
 * Ledger data model — holdings + transactions extended fields.
 *
 * Totalum stores flexible documents; new fields are optional on legacy rows.
 * Migration/backfill populates defaults without changing cash_nzd.
 *
 * ## FIFO (documented)
 * Realized P&L on sells consumes open lots oldest-first (FIFO).
 * Each buy opens a lot: { qty, fill_price, fill_currency, fx_rate, trade_datetime }.
 * Each sell closes lots in chronological order until qty is satisfied.
 *   realized_price_pnl_nzd = Σ closed_qty * (sell_price - lot.fill) * sell_fx_or_lot_native_to_nzd
 *   realized_fx_pnl_nzd    = Σ closed_qty * lot.fill * (sell_fx - lot.fx)  [native→NZD drift]
 *   realized_pnl_nzd       = realized_price_pnl_nzd + realized_fx_pnl_nzd
 * Unrealized uses mark_price (live) only — never books realized from mark_price.
 * Recommendations (Stox/Koins/Headmaster) are idea|paper until user confirms "I filled this".
 */

import type { ExecutionStatus, OrderSizing, PriceSource } from "@/lib/fill-integrity";

export type InstrumentType = "equity" | "crypto" | "metal" | "cash";
export type Venue = "NZX" | "ASX" | "US" | "CRYPTO" | "METALS" | "CASH" | string;

/** Full transaction / fill row (CSV + API). */
export interface LedgerTradeFields {
  ticker: string;
  instrument_type?: InstrumentType;
  venue?: Venue;
  asset_id?: string; // canonical id (coingecko / yahoo)
  quantity: number;
  fill_price: number;
  fill_currency: "NZD" | "AUD" | "USD";
  signal_price?: number | null;
  mark_price?: number | null;
  price_source: PriceSource;
  price_as_at?: string | null;
  trade_datetime?: string; // Pacific/Auckland
  execution_status: ExecutionStatus;
  order_sizing?: OrderSizing;
  notional_native?: number | null;
  fees_native?: number;
  fees_nzd?: number;
  fx_rate?: number | null; // 1 native → NZD
  fx_timestamp?: string | null;
  fx_source?: string | null;
  native_notional?: number | null;
  cash_nzd?: number | null;
  realized_price_pnl_nzd?: number;
  realized_fx_pnl_nzd?: number;
  realized_pnl_nzd?: number;
  broker?: string | null;
  notes?: string | null;
}

/** Holding row extensions. */
export interface LedgerHoldingFields {
  ticker: string;
  instrument_type?: InstrumentType;
  venue?: Venue;
  asset_id?: string;
  quantity: number; // shares
  fill_price: number; // avg cost / purchase_price
  fill_currency: "NZD" | "AUD" | "USD";
  mark_price?: number | null;
  price_source?: PriceSource;
  price_as_at?: string | null;
  execution_status?: ExecutionStatus;
  fees_native?: number;
  fees_nzd?: number;
  fx_rate?: number | null;
  cash_nzd?: number | null; // NEVER auto-changed by repair
  broker?: string | null;
  notes?: string | null;
}

export const CSV_EXPORT_COLUMNS = [
  "Date",
  "DateTime_NZ",
  "ExecutionStatus",
  "Type",
  "Ticker",
  "AssetName",
  "AssetType",
  "AssetId",
  "Quantity",
  "FillPrice",
  "FillCurrency",
  "PriceSource",
  "PriceAsAt",
  "SignalPrice",
  "MarkPriceAtExport",
  "FeesNative",
  "FeesNZD",
  "NativeNotional",
  "FxRate",
  "FxSource",
  "CashNZD",
  "RealizedPricePnlNZD",
  "RealizedFxPnlNZD",
  "RealizedPnlNZD",
  "OrderSizing",
  "NotionalNative",
  "Broker",
  "Notes",
] as const;

export type CsvExportColumn = (typeof CSV_EXPORT_COLUMNS)[number];

export interface FifoLot {
  qty: number;
  fillPrice: number;
  fillCurrency: string;
  fxRate: number; // → NZD
  tradeDatetime: string;
}

export interface FifoCloseResult {
  realized_price_pnl_nzd: number;
  realized_fx_pnl_nzd: number;
  realized_pnl_nzd: number;
  remainingLots: FifoLot[];
  closedPairs: Array<{ buy: FifoLot; qty: number; sellPrice: number; sellFx: number }>;
}

/**
 * Apply a sell against FIFO lots.
 * Price P&L: qty * (sellPrice - buyFill) converted at sell FX (price move in native, then to NZD).
 * FX P&L: qty * buyFill * (sellFx - buyFx) — cost basis FX drift.
 */
export function fifoApplySell(
  lots: FifoLot[],
  sellQty: number,
  sellPrice: number,
  sellFxToNzd: number
): FifoCloseResult {
  let remaining = sellQty;
  const remainingLots = lots.map((l) => ({ ...l }));
  const closedPairs: FifoCloseResult["closedPairs"] = [];
  let pricePnl = 0;
  let fxPnl = 0;

  for (const lot of remainingLots) {
    if (remaining <= 1e-12) break;
    if (lot.qty <= 1e-12) continue;
    const take = Math.min(lot.qty, remaining);
    const priceNative = take * (sellPrice - lot.fillPrice);
    pricePnl += priceNative * sellFxToNzd;
    fxPnl += take * lot.fillPrice * (sellFxToNzd - lot.fxRate);
    closedPairs.push({ buy: { ...lot, qty: take }, qty: take, sellPrice, sellFx: sellFxToNzd });
    lot.qty -= take;
    remaining -= take;
  }

  return {
    realized_price_pnl_nzd: round2(pricePnl),
    realized_fx_pnl_nzd: round2(fxPnl),
    realized_pnl_nzd: round2(pricePnl + fxPnl),
    remainingLots: remainingLots.filter((l) => l.qty > 1e-12),
    closedPairs,
  };
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Defaults when backfilling legacy rows. */
export function backfillTradeDefaults(row: Record<string, unknown>): LedgerTradeFields {
  const qty = Number(row.quantity ?? row.shares) || 0;
  const fill = Number(row.fill_price ?? row.price ?? row.purchase_price) || 0;
  const currency = (row.fill_currency || row.currency || "NZD") as LedgerTradeFields["fill_currency"];
  const status = (row.execution_status as ExecutionStatus) || "filled";
  const priceSource = (row.price_source as PriceSource) || "user_fill";
  const fees = Number(row.fees_native ?? row.fees) || 0;
  const fx = row.fx_rate != null ? Number(row.fx_rate) : currency === "NZD" ? 1 : null;
  const pricePnl = Number(row.realized_price_pnl_nzd) || 0;
  const fxPnl = Number(row.realized_fx_pnl_nzd) || 0;
  const legacyRealized = Number(row.realized_pnl ?? row.realized_pnl_nzd) || 0;
  const realizedSplit =
    row.realized_price_pnl_nzd != null || row.realized_fx_pnl_nzd != null
      ? { price: pricePnl, fx: fxPnl, total: round2(pricePnl + fxPnl) }
      : { price: legacyRealized, fx: 0, total: legacyRealized };

  return {
    ticker: String(row.ticker || ""),
    instrument_type: (row.instrument_type as InstrumentType) || undefined,
    venue: row.venue as Venue | undefined,
    asset_id: row.asset_id ? String(row.asset_id) : undefined,
    quantity: qty,
    fill_price: fill,
    fill_currency: currency,
    signal_price: row.signal_price != null ? Number(row.signal_price) : null,
    mark_price: row.mark_price != null ? Number(row.mark_price) : null,
    price_source: priceSource,
    price_as_at: row.price_as_at ? String(row.price_as_at) : null,
    trade_datetime: row.trade_datetime ? String(row.trade_datetime) : undefined,
    execution_status: status,
    order_sizing: (row.order_sizing as OrderSizing) || "units",
    notional_native: row.notional_native != null ? Number(row.notional_native) : qty * fill,
    fees_native: fees,
    fees_nzd: row.fees_nzd != null ? Number(row.fees_nzd) : undefined,
    fx_rate: fx,
    fx_timestamp: row.fx_timestamp ? String(row.fx_timestamp) : null,
    fx_source: row.fx_source ? String(row.fx_source) : null,
    native_notional: row.native_notional != null ? Number(row.native_notional) : qty * fill,
    cash_nzd: row.cash_nzd != null ? Number(row.cash_nzd) : row.total != null ? Number(row.total) : null,
    realized_price_pnl_nzd: realizedSplit.price,
    realized_fx_pnl_nzd: realizedSplit.fx,
    realized_pnl_nzd: realizedSplit.total,
    broker: row.broker ? String(row.broker) : null,
    notes: row.notes ? String(row.notes) : null,
  };
}

export function venueForTicker(ticker: string, assetType?: string): Venue {
  const t = (ticker || "").toUpperCase();
  if (assetType === "crypto") return "CRYPTO";
  if (assetType === "metal" || t === "GOLD" || t === "SILVER") return "METALS";
  if (t.endsWith(".NZ")) return "NZX";
  if (t.endsWith(".AX")) return "ASX";
  return "US";
}
