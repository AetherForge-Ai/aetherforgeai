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
import {
  checkFillSanity,
  aucklandDateTimeISO,
  ADVISORY_NOTE,
  type PriceSource,
  type ExecutionStatus,
  type OrderSizing,
} from "@/lib/fill-integrity";
import { canonicalCryptoId } from "@/lib/crypto-ids";
import { venueForTicker, fifoApplySell, type FifoLot } from "@/lib/ledger-schema";
import { logLedgerAudit, appendAuditNote } from "@/lib/ledger-audit";
import { feedEntryForTicker } from "@/lib/feed-mapping";

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
  price?: number; // native price per unit (= fill_price)
  fees?: number; // native fees
  // Cash fields (deposit / withdraw)
  amount?: number; // NZD
  // Common
  notes?: string;
  executed_at?: string; // ISO; defaults to now
  // Ledger fill-integrity extensions
  execution_status?: ExecutionStatus; // idea|paper|filled — recommendations must NOT be filled
  price_source?: PriceSource;
  signal_price?: number;
  mark_price?: number;
  price_as_at?: string;
  order_sizing?: OrderSizing;
  notional_native?: number;
  cash_or_notional?: number; // crypto implied-price check
  cash_nzd?: number;
  broker?: string;
  soft_override_confirmed?: boolean;
  typed_live_override?: string;
  prior_close?: number;
  session_close_date?: string;
  trade_date?: string; // yyyy-mm-dd Pacific/Auckland
  fx_rate?: number;
  fx_source?: string;
  fx_timestamp?: string;
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
  const sym = String(ticker || "").toUpperCase();
  const res = await totalumSdk.crud.query("stock", {
    _filter: { user: userId, ticker: sym, asset_type: assetType },
    _limit: 5,
  });
  let holding = ((res?.data as any[]) || [])[0] || null;
  if (!holding) {
    // Case / asset_type drift — scan a few rows and match in memory.
    const legacy = await totalumSdk.crud.query("stock", {
      _filter: { user: userId },
      _limit: 500,
    });
    holding =
      ((legacy?.data as any[]) || []).find(
        (h) =>
          String(h.ticker || "").toUpperCase() === sym &&
          (h.asset_type || "stock") === assetType
      ) || null;
    if (!holding && assetType === "stock") {
      holding =
        ((legacy?.data as any[]) || []).find(
          (h) => String(h.ticker || "").toUpperCase() === sym && (h.asset_type || "stock") === "stock"
        ) || null;
    }
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

  // Recommendations / ideas must NOT book as filled trades or realized P&L.
  const executionStatus = input.execution_status || "filled";
  if (executionStatus === "idea" || executionStatus === "paper") {
    const notes = appendAuditNote(
      input.notes,
      `${executionStatus.toUpperCase()} recorded — not a broker fill. ${ADVISORY_NOTE}`
    );
    const rec = await totalumSdk.crud.createRecord("transaction", {
      type: input.type,
      ticker,
      asset_name: input.asset_name || lookupTicker(ticker)?.name || ticker,
      asset_type: assetType,
      quantity: round(quantity, 6),
      price: round(price, 6),
      fill_price: round(price, 6),
      fees: round(fees),
      total: 0,
      realized_pnl: 0,
      realized_price_pnl_nzd: 0,
      realized_fx_pnl_nzd: 0,
      realized_pnl_nzd: 0,
      currency: currencyForTicker(ticker, assetType),
      fill_currency: currencyForTicker(ticker, assetType),
      execution_status: executionStatus,
      price_source: input.price_source || "bot_signal",
      signal_price: input.signal_price ?? price,
      mark_price: input.mark_price ?? null,
      order_sizing: input.order_sizing || "units",
      instrument_type: assetType === "crypto" ? "crypto" : assetType === "metal" ? "metal" : "equity",
      venue: venueForTicker(ticker, assetType),
      asset_id: assetType === "crypto" ? canonicalCryptoId(ticker) : (feedEntryForTicker(ticker)?.providerId || ticker),
      trade_datetime: aucklandDateTimeISO(executedAt),
      notes,
      executed_at: executedAt,
      user: user._id,
    });
    logLedgerAudit({
      action: `record_${executionStatus}`,
      ticker,
      userId: user._id,
      after: { quantity, price, executionStatus },
    });
    console.log(`[transactions] ${executionStatus.toUpperCase()} ${ticker} — no cash/holdings mutation`);
    return { transaction: rec?.data, cashBalance: currentCash, realizedNZD: 0, holdingId: null };
  }

  // Resolve live spot for fill sanity (same currency as fill).
  let liveSpot: number | null = null;
  try {
    if (assetType === "crypto") {
      const quotes = await fetchCryptoQuotes([ticker]);
      liveSpot = quotes[ticker.toUpperCase()]?.price ?? null;
    } else if (assetType === "metal") {
      const key = metalKeyForTicker(ticker);
      if (key) {
        const spot = await getMetalsSpot();
        liveSpot = spot[key]?.nzdPerOz ?? null;
      }
    } else if (isLiveDataConfigured()) {
      liveSpot = (await fetchLivePrice(ticker)) || null;
    }
  } catch (err) {
    console.error(`[transactions] Live spot for sanity check failed (${ticker}):`, err);
  }

  const sanity = checkFillSanity({
    ticker,
    quantity,
    fillPrice: price,
    liveSpot,
    cashOrNotional: input.cash_or_notional ?? input.notional_native ?? null,
    fees,
    cashNzd: input.cash_nzd ?? null,
    fillCurrency: currencyForTicker(ticker, assetType),
    assetType: assetType === "metal" ? "metal" : assetType,
    typedLiveOverride: input.typed_live_override,
    softOverrideConfirmed: !!input.soft_override_confirmed,
    priceSource: input.price_source || "user_fill",
    priorClose: input.prior_close,
    tradeDate: input.trade_date,
    sessionCloseDate: input.session_close_date,
  });
  if (sanity.blocked) {
    logLedgerAudit({
      action: "fill_blocked",
      ticker,
      userId: user._id,
      meta: { code: sanity.code, message: sanity.message, liveSpot, price, quantity },
    });
    throw new Error(sanity.message || `Fill blocked for ${ticker}`);
  }

  // Never silently copy mark/signal onto fill — require explicit price_source.
  if (input.price_source === "bot_signal") {
    throw new Error(`${ticker}: bot_signal cannot be fill_price. ${ADVISORY_NOTE}`);
  }

  const currency = currencyForTicker(ticker, assetType);
  const fx = await getFxSnapshot();
  const rates = fx.ratesToNZD;

  const holding = await findHolding(user._id, ticker, assetType);

  // ---- BUY ----
  if (input.type === "buy") {
    // Accidental double-submit guard: identical buy within 45s returns the prior row.
    try {
      const recent = await totalumSdk.crud.query("transaction", {
        _filter: { user: user._id, type: "buy", ticker },
        _limit: 8,
        _order: "-executed_at",
      });
      const now = Date.now();
      const dup = ((recent?.data as any[]) || []).find((t) => {
        const at = new Date(t.executed_at || t.created_at || 0).getTime();
        if (!(now - at < 45_000)) return false;
        const q = Number(t.quantity);
        const p = Number(t.price);
        return Math.abs(q - quantity) < 1e-8 && Math.abs(p - price) < 1e-8;
      });
      if (dup) {
        console.warn(`[transactions] Duplicate buy suppressed for ${ticker} (within 45s)`);
        return {
          cashBalance: currentCash,
          realizedNZD: 0,
          transaction: dup,
          holdingId: dup.holding_id || null,
        };
      }
    } catch (err) {
      console.error("[transactions] Duplicate-buy check failed (non-fatal):", err);
    }

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

    const feed = feedEntryForTicker(ticker);
    const fxRate = input.fx_rate ?? rates[currency] ?? 1;
    const auditNotes = appendAuditNote(
      notes,
      `FILLED buy qty=${quantity} fill=${price} ${currency} live=${liveSpot ?? "n/a"} source=${input.price_source || "user_fill"}. ${ADVISORY_NOTE}`
    );
    logLedgerAudit({
      action: "fill_buy",
      ticker,
      userId: user._id,
      quote: liveSpot ? { source: assetType === "crypto" ? "crypto" : "equity", price: liveSpot, as_at: new Date().toISOString() } : undefined,
      after: { quantity, fill_price: price, cash_nzd: -costNZD, fx_rate: fxRate },
    });
    const rec = await totalumSdk.crud.createRecord("transaction", {
      type: "buy",
      ticker,
      asset_name: input.asset_name || holding?.company_name || lookupTicker(ticker)?.name || ticker,
      asset_type: assetType,
      instrument_type: assetType === "crypto" ? "crypto" : assetType === "metal" ? "metal" : "equity",
      venue: venueForTicker(ticker, assetType),
      asset_id: assetType === "crypto" ? canonicalCryptoId(ticker) : (feed?.providerId || ticker),
      quantity: round(quantity, 6),
      price: round(price, 6),
      fill_price: round(price, 6),
      fill_currency: currency,
      signal_price: input.signal_price ?? null,
      mark_price: liveSpot,
      price_source: input.price_source || "user_fill",
      price_as_at: input.price_as_at || new Date().toISOString(),
      trade_datetime: aucklandDateTimeISO(executedAt),
      execution_status: "filled",
      order_sizing: input.order_sizing || "units",
      notional_native: round(quantity * price, 6),
      native_notional: round(quantity * price, 6),
      fees_native: round(fees),
      fees_nzd: round(convertCurrency(fees, currency, "NZD", rates)),
      fx_rate: fxRate,
      fx_timestamp: input.fx_timestamp || new Date().toISOString(),
      fx_source: input.fx_source || "fx_snapshot",
      cash_nzd: round(-costNZD),
      realized_pnl: 0,
      realized_price_pnl_nzd: 0,
      realized_fx_pnl_nzd: 0,
      realized_pnl_nzd: 0,
      broker: input.broker || null,
      fees: round(fees),
      total: round(-costNZD),
      currency,
      notes: auditNotes,
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
  // FIFO-style split: price P&L at sell FX; FX P&L vs lot FX (legacy avg uses buy FX ≈ current if unknown).
  const sellFx = input.fx_rate ?? rates[currency] ?? 1;
  const lotFx = Number(holding.fx_rate) || sellFx;
  const fifo = fifoApplySell(
    [{ qty: quantity, fillPrice: avgCost, fillCurrency: currency, fxRate: lotFx, tradeDatetime: String(holding.purchase_date || "") }],
    quantity,
    price,
    sellFx
  );
  const realizedPriceNZD = fifo.realized_price_pnl_nzd;
  const realizedFxNZD = fifo.realized_fx_pnl_nzd;
  const realizedNZD = round(realizedPriceNZD + realizedFxNZD);
  // Keep legacy native→NZD path as sanity floor when FIFO fx identical
  const legacyRealizedNZD = round(convertCurrency(realizedNative, currency, "NZD", rates));
  const realizedBooked = Math.abs(sellFx - lotFx) < 1e-9 ? legacyRealizedNZD : realizedNZD;

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
    realized_pnl: realizedBooked,
    realized_price_pnl_nzd: Math.abs(sellFx - lotFx) < 1e-9 ? legacyRealizedNZD : realizedPriceNZD,
    realized_fx_pnl_nzd: Math.abs(sellFx - lotFx) < 1e-9 ? 0 : realizedFxNZD,
    realized_pnl_nzd: realizedBooked,
    fill_price: round(price, 6),
    fill_currency: currency,
    execution_status: "filled",
    price_source: input.price_source || "user_fill",
    trade_datetime: aucklandDateTimeISO(executedAt),
    mark_price: liveSpot,
    fx_rate: sellFx,
    cash_nzd: round(proceedsNZD),
    currency,
    notes,
    executed_at: executedAt,
    user: user._id,
    ...(holdingId ? { stock: holdingId } : {}),
  });
  return { transaction: rec?.data, cashBalance: newCash, realizedNZD: realizedBooked, holdingId };
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
