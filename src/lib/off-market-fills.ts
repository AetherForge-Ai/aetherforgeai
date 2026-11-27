/**
 * Read-only scan for fills whose price is wildly off a reference.
 * Nothing here writes a ledger row or calls a route.
 */

import { quoteDisagreesWithReference } from "@/lib/quote-sanity";

export interface OffMarketFill {
  id?: string | null;
  ticker: string;
  price: number;
  quantity?: number | null;
  executedAt?: string | null;
}

export interface OffMarketFlag {
  id: string | null;
  ticker: string;
  price: number;
  quantity: number | null;
  reference: number;
  reason: string;
}

function referenceFor(references: Record<string, number>, ticker: string): number | null {
  const code = ticker.trim().toUpperCase();
  if (!code) return null;
  const direct = Number(references[code]);
  if (direct > 0 && Number.isFinite(direct)) return direct;
  const lower = Number(references[code.toLowerCase()]);
  if (lower > 0 && Number.isFinite(lower)) return lower;
  return null;
}

/**
 * Rows whose price is more than 90% below or more than 10× above the reference for that ticker.
 * A row with no reference is left alone. The input list is not changed.
 */
export function flagOffMarketFills(rows: OffMarketFill[], references: Record<string, number>): OffMarketFlag[] {
  const flags: OffMarketFlag[] = [];
  for (const row of rows) {
    const ticker = String(row.ticker || "").trim().toUpperCase();
    const price = Number(row.price);
    const reference = referenceFor(references, ticker);
    if (!ticker || !(price > 0) || !Number.isFinite(price) || reference == null) continue;
    if (!quoteDisagreesWithReference(price, reference)) continue;
    flags.push({
      id: row.id == null ? null : String(row.id),
      ticker,
      price,
      quantity: row.quantity == null || !Number.isFinite(Number(row.quantity)) ? null : Number(row.quantity),
      reference,
      reason: `${ticker} price ${price} is off the reference ${reference}.`,
    });
  }
  return flags;
}
