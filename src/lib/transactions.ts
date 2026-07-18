/**
 * Transaction engine — SERVER-ONLY.
 *
 * The Transaction Center records every portfolio movement as an immutable
 * ledger row and keeps three things in sync:
 *   • Holdings   — a buy adds shares & re-averages cost; a sell reduces shares.
 *   • Cash       — buys/withdrawals debit cash, sells/deposits credit it (NZD).
 *   • Realized P&L — a sell books `quantity × (price − avgCost) − fees` (NZD).
 *
 * All cash is tracked in NZD (the Stox base currency). Trades priced in AUD/USD
 * are converted with live FX (baseline fallback) so the cash ledger is coherent
 * across exchanges. Every mutation is logged; nothing is silently swallowed.
 */

import "server-only";
import { totalumSdk } from "@/lib/totalum";
import type { AppUser } from "@/lib/session";
import { currencyForTicker, convertCurrency } from "@/lib/currency";
import { getFxSnapshot } from "@/lib/fx";
import { normalizeTicker, lookupTicker, referencePrice } from "@/lib/market";
import { fetchLivePrice, isLiveDataConfigured, fetchCryptoQuotes } from "@/lib/market-data";
import { getMetalsSpot } from "@/lib/metals";

export type TxType = "buy" | "sell" | "deposit" | "withdraw";
export type TxAssetType = "stock" | "crypto" | "metal";

/** Map a metal holding's ticker (GOLD/SILVER) to the spot-price key. */
function metalKeyForTicker(ticker: string): MetalKey | null {
  const t = (ticker || "").toUpperCase();
  if (t === "GOLD") return "gold";
  if (t === "SILVER") return "silver";
  return null;
}

/** Human-friendly default company name for a precious-metal holding. */
function metalName(ticker: string): string {
  return metalKeyForTicker(ticker) === "gold" ? "Gold bullion" : "Silver bullion";
}

export interface TransactionInput {
  type: TxType;
  // Trade fields (buy / sell)
  ticker?: string;
  asset_name?: string;
  asset_type?: TxAssetType;
  sector?: string;
  quantity?: number; // units traded
  price?: number; // native price per unit
  fees?: number; // native fees
  // Cash fields (deposit / withdraw)
  amount?: number; // NZD
  // Common
  notes?: string;
  executed_at?: string; // ISO; defaults to now
}

export interface TransactionResult {
  transaction: any;
  cashBalance: number; // NZD after the movement
  realizedNZD: number; // realized P&L booked by this movement (sells only)
  holdingId?: string | null; // affected holding (null if fully closed)
}

function round(n: number, decimals = 2): number {
  const f = 10 ** decimals;
  return Math.round((n + Number.EPSILON) * f) / f;
}

/** Fetch the affected holding for a ticker, tolerating legacy rows w/o asset_type. */
async function findHolding(userId: string, ticker: string, assetType: TxAssetType) {
  const res = await totalumSdk.crud.query("stock", {
    _filter: { user: userId, ticker, asset_type: assetType },
    _limit: 1,
  });
  let holding = ((res?.data as any[]) || [])[0] || null;
  if (!holding && assetType === "stock") {
    // Legacy holdings created before asset_type existed default to "stock".
    const legacy = await totalumSdk.crud.query("stock", {
      _filter: { user: userId, ticker },
      _limit: 5,
    });
    holding = ((legacy?.data as any[]) || []).find((h) => (h.asset_type || "stock") === "stock") || null;
  }
  return holding;
}

/**
 * Apply a transaction: mutate holdings + cash, then write the ledger row.
 * Throws (never silently swallows) on any validation or persistence failure.
 */
export async function applyTransaction(user: AppUser, input: TransactionInput): Promise<TransactionResult> {
  const currentCash = typeof user.cash_balance === "number" ? user.cash_balance : 0;
  const executedAt = input.executed_at ? new Date(input.executed_at) : new Date();
  const notes = (input.notes || "").slice(0, 500);

  // ---------- Cash-only movements ----------
  if (input.type === "deposit" || input.type === "withdraw") {
    const amount = Math.max(0, Number(input.amount) || 0);
    if (amount <= 0) throw new Error("Amount must be greater than 0");
    if (input.type === "withdraw" && amount > currentCash + 1e-6) {
      throw new Error("Insufficient cash balance for this withdrawal");
    }
    const delta = input.type === "deposit" ? amount : -amount;
    const newCash = round(currentCash + delta);

    console.log(`[transactions] ${input.type} ${amount} NZD for user ${user._id} → cash ${newCash}`);
    await totalumSdk.crud.editRecordById("user", user._id, { cash_balance: newCash });

    const rec = await totalumSdk.crud.createRecord("transaction", {
      type: input.type,
      asset_type: "cash",
      asset_name: input.type === "deposit" ? "Cash deposit" : "Cash withdrawal",
      quantity: amount,
      price: 1,
      fees: 0,
      total: round(delta),
      realized_pnl: 0,
      currency: "NZD",
      notes,
      executed_at: executedAt,
      user: user._id,
    });
    return { transaction: rec?.data, cashBalance: newCash, realizedNZD: 0, holdingId: null };
  }

  // ---------- Trades (buy / sell) ----------
  const ticker = normalizeTicker(input.ticker || "");
  if (!ticker) throw new Error("Ticker is required");
  const assetType: TxAssetType = input.asset_type || "stock";
  const quantity = Number(input.quantity) || 0;
  const price = Number(input.price) || 0;
  const fees = Math.max(0, Number(input.fees) || 0);
  if (quantity <= 0) throw new Error("Quantity must be greater than 0");
  if (price <= 0) throw new Error("Price must be greater than 0");

  const currency = currencyForTicker(ticker, assetType);
  const fx = await getFxSnapshot();
  const rates = fx.ratesToNZD;

  const holding = await findHolding(user._id, ticker, assetType);

  // ---- BUY ----
  if (input.type === "buy") {
    const costNative = quantity * price + fees;
    const costNZD = round(convertCurrency(costNative, currency, "NZD", rates));
    let holdingId: string;

    if (holding) {
      const oldShares = holding.shares || 0;
      const oldAvg = holding.purchase_price || 0;
      const newShares = oldShares + quantity;
      // New weighted-average cost includes fees so cost basis stays honest.
      const newAvg = newShares > 0 ? (oldShares * oldAvg + quantity * price + fees) / newShares : price;
      await totalumSdk.crud.editRecordById("stock", holding._id, {
        shares: round(newShares, 6),
        purchase_price: round(newAvg, 6),
      });
      holdingId = holding._id;
      console.log(`[transactions] BUY ${quantity} ${ticker} → ${newShares} @ avg ${round(newAvg, 4)} (${currency})`);
    } else {
      // New position — resolve a live current price so the P&L is meaningful.
      const info = lookupTicker(ticker);
      let current_price = referencePrice(ticker, price);
      try {
        if (assetType === "crypto") {
          const quotes = await fetchCryptoQuotes([ticker]);
          const live = quotes[ticker.toUpperCase()]?.price;
          if (live && live > 0) current_price = live;
        } else if (assetType === "metal") {
          // Gold/silver price live at the NZD spot per troy ounce.
          const key = metalKeyForTicker(ticker);
          if (key) {
            const spot = await getMetalsSpot();
            const live = spot[key]?.nzdPerOz;
            if (live && live > 0) current_price = live;
          }
        } else if (isLiveDataConfigured()) {
          const live = await fetchLivePrice(ticker);
          if (live && live > 0) current_price = live;
        }
      } catch (err) {
        console.error(`[transactions] Live price lookup failed for ${ticker} (non-fatal):`, err);
      }
      const avgWithFees = (quantity * price + fees) / quantity;
      const created = await totalumSdk.crud.createRecord("stock", {
        ticker,
        asset_type: assetType,
        company_name:
          input.asset_name || (assetType === "metal" ? metalName(ticker) : info?.name) || ticker,
        sector:
          input.sector ||
          info?.sector ||
          (assetType === "crypto" ? "Digital Assets" : assetType === "metal" ? "Precious Metals" : "Other"),
        shares: round(quantity, 6),
        purchase_price: round(avgWithFees, 6),
        current_price,
        user: user._id,
      });
      holdingId = created?.data?._id;
      console.log(`[transactions] BUY opened new position ${ticker} (${quantity} @ ${price} ${currency})`);
    }

    const newCash = round(currentCash - costNZD);
    await totalumSdk.crud.editRecordById("user", user._id, { cash_balance: newCash });

    const rec = await totalumSdk.crud.createRecord("transaction", {
      type: "buy",
      ticker,
      asset_name: input.asset_name || holding?.company_name || lookupTicker(ticker)?.name || ticker,
      asset_type: assetType,
      quantity: round(quantity, 6),
      price: round(price, 6),
      fees: round(fees),
      total: round(-costNZD),
      realized_pnl: 0,
      currency,
      notes,
      executed_at: executedAt,
      user: user._id,
      ...(holdingId ? { stock: holdingId } : {}),
    });
    return { transaction: rec?.data, cashBalance: newCash, realizedNZD: 0, holdingId };
  }

  // ---- SELL ----
  if (!holding) throw new Error(`You don't hold ${ticker} to sell`);
  const heldShares = holding.shares || 0;
  if (quantity > heldShares + 1e-6) {
    throw new Error(`You only hold ${round(heldShares, 6)} unit(s) of ${ticker}`);
  }
  const avgCost = holding.purchase_price || 0;
  const proceedsNative = quantity * price - fees;
  const realizedNative = quantity * (price - avgCost) - fees;
  const proceedsNZD = round(convertCurrency(proceedsNative, currency, "NZD", rates));
  const realizedNZD = round(convertCurrency(realizedNative, currency, "NZD", rates));

  const remaining = heldShares - quantity;
  let holdingId: string | null = holding._id;
  if (remaining <= 1e-6) {
    // Position fully closed — remove it from the tracked holdings.
    await totalumSdk.crud.deleteRecordById("stock", holding._id);
    holdingId = null;
    console.log(`[transactions] SELL closed position ${ticker} (${quantity} @ ${price} ${currency})`);
  } else {
    await totalumSdk.crud.editRecordById("stock", holding._id, { shares: round(remaining, 6) });
    console.log(`[transactions] SELL ${quantity} ${ticker} → ${round(remaining, 6)} remaining`);
  }

  const newCash = round(currentCash + proceedsNZD);
  await totalumSdk.crud.editRecordById("user", user._id, { cash_balance: newCash });

  const rec = await totalumSdk.crud.createRecord("transaction", {
    type: "sell",
    ticker,
    asset_name: input.asset_name || holding.company_name || ticker,
    asset_type: assetType,
    quantity: round(quantity, 6),
    price: round(price, 6),
    fees: round(fees),
    total: round(proceedsNZD),
    realized_pnl: realizedNZD,
    currency,
    notes,
    executed_at: executedAt,
    user: user._id,
    ...(holdingId ? { stock: holdingId } : {}),
  });
  return { transaction: rec?.data, cashBalance: newCash, realizedNZD, holdingId };
}

export type MetalKey = "gold" | "silver";

export interface MetalTradeResult {
  transaction: any;
  cashBalance: number; // NZD after the movement
  realizedNZD: number; // realized P&L booked (sells only)
}

/**
 * Record a precious-metals buy/sell in the SAME ledger + cash system used by
 * stocks & crypto. Metals are priced in NZD per troy ounce, so no FX is needed.
 * This is what keeps the Transaction Center and the cash balance coherent across
 * every asset class — a gold/silver buy now debits cash and shows in the ledger,
 * exactly like a share purchase. Throws (never silently swallows) on any failure.
 */
export async function recordMetalTrade(
  user: AppUser,
  input: {
    side: "buy" | "sell";
    metal: MetalKey;
    ounces: number;
    pricePerOzNZD: number;
    avgCostNZD?: number; // sells only — for realized P&L vs the cost paid
    fees?: number;
    notes?: string;
    executedAt?: Date;
  }
): Promise<MetalTradeResult> {
  const currentCash = typeof user.cash_balance === "number" ? user.cash_balance : 0;
  const ounces = Number(input.ounces) || 0;
  const price = Number(input.pricePerOzNZD) || 0;
  const fees = Math.max(0, Number(input.fees) || 0);
  if (ounces <= 0) throw new Error("Ounces must be greater than 0");
  if (price <= 0) throw new Error("Price per ounce must be greater than 0");

  const gross = ounces * price;
  const ticker = input.metal === "gold" ? "GOLD" : "SILVER";
  const assetName = input.metal === "gold" ? "Gold bullion" : "Silver bullion";
  const executedAt = input.executedAt || new Date();
  const notes = (input.notes || "").slice(0, 500);

  // `total` is the signed cash impact (buys debit, sells credit).
  let total: number;
  let realizedNZD = 0;
  if (input.side === "buy") {
    total = round(-(gross + fees));
  } else {
    total = round(gross - fees);
    const avg = Number(input.avgCostNZD) || 0;
    realizedNZD = round(ounces * (price - avg) - fees);
  }
  const newCash = round(currentCash + total);

  await totalumSdk.crud.editRecordById("user", user._id, { cash_balance: newCash });
  console.log(
    `[transactions] METAL ${input.side} ${ounces}oz ${ticker} @ ${price} NZD → cash ${newCash}, realized ${realizedNZD}`
  );

  const rec = await totalumSdk.crud.createRecord("transaction", {
    type: input.side,
    ticker,
    asset_name: assetName,
    asset_type: "metal",
    quantity: round(ounces, 6),
    price: round(price, 4),
    fees: round(fees),
    total,
    realized_pnl: realizedNZD,
    currency: "NZD",
    notes,
    executed_at: executedAt,
    user: user._id,
  });
  return { transaction: rec?.data, cashBalance: newCash, realizedNZD };
}

export interface TransactionRow {
  _id: string;
  type: TxType;
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
}

export interface TransactionLedger {
  transactions: TransactionRow[];
  cashBalance: number;
  realizedYtd: number;
  realizedTotal: number;
  realizedYtdCount: number;
}

/** Load a user's ledger plus cash + realized-P&L rollups (all NZD). */
export async function loadLedger(user: AppUser, limit = 60): Promise<TransactionLedger> {
  // Recent rows for the ledger table…
  const recentRes = await totalumSdk.crud.query("transaction", {
    _filter: { user: user._id },
    _sort: { executed_at: "desc", createdAt: "desc" },
    _limit: limit,
  });
  const rows = ((recentRes?.data as unknown as TransactionRow[]) || []).map((r) => ({
    ...r,
    executed_at: (r as any).executed_at || (r as any).createdAt,
  }));

  // …and ALL sell rows (realized P&L must reflect the full history, not just
  // the recent page). Sells are a small subset, so this stays cheap.
  const sellsRes = await totalumSdk.crud.query("transaction", {
    _filter: { user: user._id, type: "sell" },
    _limit: 5000,
  });
  const sells = (sellsRes?.data as unknown as TransactionRow[]) || [];

  const yearStart = new Date(new Date().getFullYear(), 0, 1).getTime();
  let realizedTotal = 0;
  let realizedYtd = 0;
  let realizedYtdCount = 0;
  for (const r of sells) {
    if (typeof r.realized_pnl !== "number") continue;
    realizedTotal += r.realized_pnl;
    const t = new Date((r as any).executed_at || r.createdAt || 0).getTime();
    if (t >= yearStart) {
      realizedYtd += r.realized_pnl;
      realizedYtdCount += 1;
    }
  }

  return {
    transactions: rows,
    cashBalance: typeof user.cash_balance === "number" ? user.cash_balance : 0,
    realizedYtd: round(realizedYtd),
    realizedTotal: round(realizedTotal),
    realizedYtdCount,
  };
}
