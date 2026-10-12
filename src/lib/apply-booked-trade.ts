/**
 * Paint a confirmed trade onto the holdings already on screen.
 * The ledger POST is the source of the new quantity; the dashboard does not
 * wait for a second /api/stocks round trip.
 * pull-check:batch1-2026-10-11 B1-3
 */

export interface BookedTrade {
  _id?: string | null;
  type?: string | null;
  ticker?: string | null;
  asset_type?: string | null;
  asset_name?: string | null;
  quantity?: number | null;
  price?: number | null;
}

export interface HoldingSnapshot {
  _id: string;
  ticker: string;
  asset_type?: string;
  company_name?: string;
  shares: number;
  purchase_price: number;
  current_price: number;
}

export function applyBookedTradeToHoldings<T extends HoldingSnapshot>(
  holdings: readonly T[],
  trade: BookedTrade | null | undefined
): T[] {
  if (!trade) return [...holdings];
  const type = String(trade.type || "").toLowerCase();
  if (type !== "buy" && type !== "sell" && type !== "opening_balance") return [...holdings];
  const ticker = String(trade.ticker || "").trim().toUpperCase();
  const qty = Number(trade.quantity);
  const price = Number(trade.price);
  if (!ticker || !(qty > 0) || !(price > 0)) return [...holdings];
  const assetType = String(trade.asset_type || "stock").toLowerCase();
  const idx = holdings.findIndex(
    (row) => row.ticker.toUpperCase() === ticker && String(row.asset_type || "stock").toLowerCase() === assetType
  );
  if (type === "sell") {
    if (idx < 0) return [...holdings];
    const nextShares = Math.max(0, Number(holdings[idx].shares) - qty);
    if (nextShares <= 1e-6) return holdings.filter((_, i) => i !== idx);
    return holdings.map((row, i) => (i === idx ? { ...row, shares: nextShares } : row));
  }
  if (idx < 0) {
    const created = {
      _id: `pending-${assetType}-${ticker}`,
      ticker,
      asset_type: assetType,
      company_name: trade.asset_name || ticker,
      shares: qty,
      purchase_price: price,
      current_price: price,
    } as T;
    return [created, ...holdings];
  }
  const row = holdings[idx];
  const prevShares = Number(row.shares) || 0;
  const prevAvg = Number(row.purchase_price) || 0;
  const nextShares = prevShares + qty;
  const nextAvg = nextShares > 0 ? (prevShares * prevAvg + qty * price) / nextShares : price;
  return holdings.map((item, i) =>
    i === idx
      ? {
          ...item,
          shares: nextShares,
          purchase_price: nextAvg,
          current_price: Number(item.current_price) > 0 ? item.current_price : price,
        }
      : item
  );
}

/**
 * A holdings or snapshot body that started before the trade, or a read that
 * has not seen the new row yet, must not wipe the coin just painted.
 */
export function retainBookedHolding<T extends HoldingSnapshot>(
  current: readonly T[],
  incoming: readonly T[],
  trade: BookedTrade | null | undefined
): T[] {
  if (!trade) return [...incoming];
  const type = String(trade.type || "").toLowerCase();
  if (type !== "buy" && type !== "opening_balance") return [...incoming];
  const ticker = String(trade.ticker || "").trim().toUpperCase();
  const assetType = String(trade.asset_type || "stock").toLowerCase();
  if (!ticker) return [...incoming];
  const same = (row: HoldingSnapshot) =>
    row.ticker.toUpperCase() === ticker && String(row.asset_type || "stock").toLowerCase() === assetType;
  if (incoming.some((row) => same(row) && Number(row.shares) > 1e-9)) return [...incoming];
  const kept = current.filter((row) => same(row) && Number(row.shares) > 1e-9);
  if (!kept.length) return [...incoming];
  return [...kept, ...incoming.filter((row) => !same(row))];
}

export function snapshotOmitsBookedBuy(
  positions: ReadonlyArray<{ ticker?: string | null; quantity?: number | null }>,
  trade: BookedTrade | null | undefined
): boolean {
  if (!trade) return false;
  const type = String(trade.type || "").toLowerCase();
  if (type !== "buy" && type !== "opening_balance") return false;
  const ticker = String(trade.ticker || "").trim().toUpperCase();
  if (!ticker) return false;
  return !positions.some(
    (row) => String(row.ticker || "").toUpperCase() === ticker && Number(row.quantity) > 1e-9
  );
}
