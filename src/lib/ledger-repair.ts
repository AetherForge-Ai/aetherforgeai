/**
 * Ledger repair — flag absurd crypto fills and prior-close-on-next-day equities.
 * NEVER auto-changes cash_nzd. Proposes new_qty / new_price for user confirm.
 */

import {
  isExtremeCryptoMismatch,
  proposeRepair,
  REPAIR_CRYPTO_RATIO,
  ADVISORY_NOTE,
} from "@/lib/fill-integrity";
import { appendAuditNote } from "@/lib/ledger-audit";

export interface RepairFlag {
  id: string;
  kind: "crypto_extreme" | "equity_prior_close" | "known_bad_example";
  ticker: string;
  asset_type: string;
  quantity: number;
  fill_price: number;
  live_spot: number | null;
  ratio: number | null;
  cash_nzd: number | null;
  trade_date?: string | null;
  message: string;
  proposal?: { new_qty: number; new_price: number; note: string };
  originals: { quantity: number; fill_price: number; notes?: string };
}

/** Known bad rows from 2026-09-17/18 (APT/UNI/ARB micro-prices; AVH prior close). */
export const KNOWN_BAD_EXAMPLES: Array<{
  ticker: string;
  asset_type: "crypto" | "stock";
  quantity: number;
  fill_price: number;
  approx_live: number;
  trade_date: string;
  note: string;
}> = [
  {
    ticker: "APT",
    asset_type: "crypto",
    quantity: 61_900_000,
    fill_price: 0.0001,
    approx_live: 0.65,
    trade_date: "2026-09-17",
    note: "Micro-price bug: $6190 notional → ~9500 APT @ ~$0.65, not 61.9M @ $0.0001",
  },
  {
    ticker: "APT",
    asset_type: "crypto",
    quantity: 6_190_000,
    fill_price: 0.001,
    approx_live: 0.65,
    trade_date: "2026-09-17",
    note: "Variant micro-price APT",
  },
  {
    ticker: "UNI",
    asset_type: "crypto",
    quantity: 1_000_000,
    fill_price: 0.000163,
    approx_live: 8.0,
    trade_date: "2026-09-17",
    note: "UNI cannot save at 0.000163 when live ~$7–9",
  },
  {
    ticker: "UNI",
    asset_type: "crypto",
    quantity: 37_900_000,
    fill_price: 0.000163,
    approx_live: 8.5,
    trade_date: "2026-09-18",
    note: "UNI micro-price / huge qty variant",
  },
  {
    ticker: "ARB",
    asset_type: "crypto",
    quantity: 10_000_000,
    fill_price: 0.0006,
    approx_live: 0.19,
    trade_date: "2026-09-17",
    note: "ARB cannot save at 0.0006 when live ~$0.17–0.21",
  },
  {
    ticker: "ARB",
    asset_type: "crypto",
    quantity: 1_033_333,
    fill_price: 0.0006,
    approx_live: 0.2,
    trade_date: "2026-09-18",
    note: "ARB micro-price variant",
  },
  {
    ticker: "AVH.AX",
    asset_type: "stock",
    quantity: 2688,
    fill_price: 2.79,
    approx_live: 2.79,
    trade_date: "2026-09-17",
    note: "AVH.AX fill equals prior close 2.79 booked on next session 2026-09-17",
  },
];

export function flagHolding(row: {
  _id: string;
  ticker: string;
  asset_type?: string;
  shares: number;
  purchase_price: number;
  current_price?: number;
  cash_nzd?: number | null;
  purchase_date?: string | null;
  notes?: string;
  prior_close?: number | null;
  session_close_date?: string | null;
}): RepairFlag | null {
  const live = Number(row.current_price) || null;
  const qty = Number(row.shares) || 0;
  const fill = Number(row.purchase_price) || 0;
  const asset = row.asset_type || "stock";

  if (asset === "crypto" && live && live > 0 && isExtremeCryptoMismatch(qty, fill, live)) {
    const ratio = (qty * fill) / (qty * live);
    const prop = proposeRepair({
      quantity: qty,
      fillPrice: fill,
      liveSpot: live,
      nativeNotional: row.cash_nzd != null ? Math.abs(Number(row.cash_nzd)) : qty * fill,
    });
    return {
      id: row._id,
      kind: "crypto_extreme",
      ticker: row.ticker,
      asset_type: asset,
      quantity: qty,
      fill_price: fill,
      live_spot: live,
      ratio,
      cash_nzd: row.cash_nzd ?? null,
      trade_date: row.purchase_date,
      message: `${row.ticker}: qty×stored vs qty×live ratio ${ratio.toFixed(2)}× (threshold ${REPAIR_CRYPTO_RATIO}×). Cash NZD untouched. ${ADVISORY_NOTE}`,
      proposal: { new_qty: prop.newQty, new_price: prop.newPrice, note: prop.note },
      originals: { quantity: qty, fill_price: fill, notes: row.notes },
    };
  }

  // Equity prior-close-on-next-day
  if (
    asset !== "crypto" &&
    row.prior_close &&
    row.session_close_date &&
    row.purchase_date &&
    row.purchase_date > row.session_close_date &&
    Math.abs(fill - row.prior_close) <= Math.max(0.005, row.prior_close * 0.002)
  ) {
    return {
      id: row._id,
      kind: "equity_prior_close",
      ticker: row.ticker,
      asset_type: asset,
      quantity: qty,
      fill_price: fill,
      live_spot: live,
      ratio: live && live > 0 ? fill / live : null,
      cash_nzd: row.cash_nzd ?? null,
      trade_date: row.purchase_date,
      message: `${row.ticker}: fill ${fill} equals prior close on ${row.session_close_date} but trade_date is ${row.purchase_date}.`,
      originals: { quantity: qty, fill_price: fill, notes: row.notes },
    };
  }

  return null;
}

export function buildRepairNotes(flag: RepairFlag, confirmed: { new_qty: number; new_price: number }): string {
  return appendAuditNote(
    flag.originals.notes,
    `REPAIR confirmed: qty ${flag.originals.quantity}→${confirmed.new_qty}, fill ${flag.originals.fill_price}→${confirmed.new_price}; cash_nzd untouched (${flag.cash_nzd ?? "n/a"}). ${flag.message}`
  );
}
