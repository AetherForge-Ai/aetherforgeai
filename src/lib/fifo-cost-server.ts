/**
 * Response-only FIFO unit cost. Does not write purchase_price.
 */

import "server-only";

import { applyFifoPurchasePrices } from "@/lib/fifo-cost";
import type { TaxLedgerRow } from "@/lib/taxable-income";
import { totalumSdk } from "@/lib/totalum";

export async function overlayFifoPurchasePrices<T extends { ticker?: string | null; purchase_price?: number | null }>(
  holdings: T[],
  userId: string
): Promise<T[]> {
  try {
    const res = await totalumSdk.crud.query("transaction", {
      _filter: { user: userId },
      _limit: 5000,
    });
    const rows = ((res?.data as unknown as TaxLedgerRow[]) || []);
    return applyFifoPurchasePrices(holdings, rows);
  } catch (err) {
    console.error("[fifo] purchase-price overlay skipped:", err);
    return holdings;
  }
}
