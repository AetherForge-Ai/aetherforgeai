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
import { currencyForTicker, nativeToNzd, ensureNzdPerUsd, ensureNzdPerAud, formatQuantity, normaliseUnitPrice, roundUnitPrice, type CurrencyCode } from "@/lib/currency";
import { dexPriceForSymbol, ledgerFxRate, priceForBooking, ratesForBooking, reviewedFxAllowed } from "@/lib/reviewed-book";
import { alertsToArchive, positionIsClosed } from "@/lib/alert-lifecycle";
import { getFxSnapshot, historicalNzdPerUnit } from "@/lib/fx";
import { normalizeTicker, lookupTicker, referencePrice } from "@/lib/market";
import { fetchLivePrice, isLiveDataConfigured, fetchCryptoQuotes } from "@/lib/market-data";
import { dexQuoteRows } from "@/lib/crypto-coingecko";
import { getMetalsSpot } from "@/lib/metals";
import {
  checkFillSanity,
  aucklandDateISO,
  aucklandDateTimeISO,
  ADVISORY_NOTE,
  SANITY_RATIO_SOFT,
  type PriceSource,
  type ExecutionStatus,
  type OrderSizing,
} from "@/lib/fill-integrity";
import { canonicalCryptoId } from "@/lib/crypto-ids";
import { venueForTicker, fifoApplySell, type FifoLot } from "@/lib/ledger-schema";
import { logLedgerAudit, appendAuditNote } from "@/lib/ledger-audit";
import { feedEntryForTicker } from "@/lib/feed-mapping";
import { withUserTradeLock } from "@/lib/trade-lock";
import { applyPaperCashMove } from "@/lib/paper-cash";
import { planHoldingCorrection } from "@/lib/holding-correction";
import { buildMovementPreview } from "@/lib/movement-preview";
import { assessMovement, earlierCivilDay, movementCivilDay } from "@/lib/transaction-rules";

export type TxType =
  | "buy"
  | "sell"
  | "deposit"
  | "withdraw"
  | "dividend"
  | "tax"
  | "opening_balance"
  | "correction";
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
  // Cash fields (deposit / withdraw / dividend / tax)
  amount?: number; // NZD
  /** CoinGecko id when the name came from the extended crypto or DEX list. */
  coingecko_id?: string;
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

/** Keep a sub-cent fill (PEPE at 0.00001) instead of collapsing it to 0.01. */
function roundFillPrice(n: number): number {
  return roundUnitPrice(n);
}

/** NZD per 1 unit of the trade currency. Sub-1 quotes are the wrong direction. */
function nzdPerUnit(currency: CurrencyCode, quoted: number): number {
  if (currency === "USD") return ensureNzdPerUsd(quoted);
  if (currency === "AUD") return ensureNzdPerAud(quoted);
  return 1;
}

/** Refuse a member-typed rate that sits more than 5% from the snapshot or the trade-date rate. */
async function rejectOutOfBandFx(
  currency: CurrencyCode,
  reviewed: number | null | undefined,
  tradeDate?: string | null
) {
  const raw = Number(reviewed);
  if (currency === "NZD" || !(raw > 0) || !Number.isFinite(raw)) return;
  const [fx, historical] = await Promise.all([
    getFxSnapshot(),
    historicalNzdPerUnit(currency, tradeDate),
  ]);
  const check = reviewedFxAllowed({
    currency,
    reviewed: raw,
    snapshot: fx.ratesToNZD[currency],
    historical,
  });
  if (check.ok === false) throw new Error(check.message);
}

function fxRateFields(currency: CurrencyCode, reviewed: number | null | undefined): { fx_rate?: number } {
  const rate = ledgerFxRate(currency, reviewed);
  return rate == null ? {} : { fx_rate: rate };
}

/** Archive price alerts once a stock or crypto position is fully sold. */
export async function archiveClosedPositionAlerts(userId: string, ticker: string, remaining: number) {
  if (!positionIsClosed(remaining) || !String(ticker || "").trim()) return;
  try {
    const res = await totalumSdk.crud.query("price_alert", {
      _filter: { user: userId },
      _limit: 200,
    });
    const rows = ((res?.data as { _id?: string; ticker?: string; status?: string }[]) || []).map((a) => ({
      _id: String(a._id || ""),
      ticker: String(a.ticker || ""),
      status: a.status ?? "active",
    }));
    const matched = alertsToArchive(rows, ticker, remaining);
    for (const alert of matched) {
      if (!alert._id) continue;
      await totalumSdk.crud.editRecordById("price_alert", alert._id, { status: "archived" });
    }
    if (matched.length) {
      console.log(`[transactions] Archived ${matched.length} alert(s) for closed ${ticker}`);
    }
  } catch (err) {
    console.error(`[transactions] Failed to archive alerts for ${ticker}:`, err);
  }
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

async function readUserCash(userId: string, fallback: number): Promise<number> {
  try {
    const res = await totalumSdk.crud.getRecordById("user", userId);
    const cash = Number((res as { data?: { cash_balance?: number } })?.data?.cash_balance);
    if (Number.isFinite(cash)) return cash;
  } catch (err) {
    console.error("[transactions] Cash re-read failed, using the request snapshot:", err);
  }
  return fallback;
}

async function readHoldingShares(holdingId: string): Promise<number | null> {
  try {
    const res = await totalumSdk.crud.getRecordById("stock", holdingId);
    const shares = Number((res as { data?: { shares?: number } })?.data?.shares);
    return Number.isFinite(shares) ? shares : null;
  } catch (err) {
    console.error(`[transactions] Holding re-read failed for ${holdingId}:`, err);
    return null;
  }
}

function qtyMatches(actual: number | null, expected: number): boolean {
  return actual != null && Math.abs(actual - expected) <= 1e-4;
}

/** Earliest buy day for this account and ticker, falling back to the holding's purchase date. */
async function earliestBuyDay(userId: string, ticker: string, purchaseDate?: string | null): Promise<string | null> {
  let earliest = purchaseDate ? movementCivilDay(purchaseDate, "") : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(earliest)) earliest = "";
  try {
    const res = await totalumSdk.crud.query("transaction", {
      _filter: { user: userId, type: "buy", ticker },
      _limit: 200,
    });
    for (const row of (res?.data as Array<{ executed_at?: string; trade_date?: string }>) || []) {
      const raw = String(row.trade_date || row.executed_at || "").trim();
      if (!raw) continue;
      const day = movementCivilDay(raw, "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
      if (!earliest || day < earliest) earliest = day;
    }
  } catch (err) {
    console.error(`[transactions] First-buy lookup failed for ${ticker}:`, err);
  }
  return earliest || null;
}

/**
 * The same blocks the Record a transaction panel applies, read against this account's book.
 * A correction posted here is refused. Holding Edit passes fromHoldingEdit after it has
 * already confirmed the row belongs to the signed-in user.
 */
export async function movementRejectionForUser(
  user: AppUser,
  input: TransactionInput,
  opts: { fromHoldingEdit?: boolean } = {}
): Promise<string | null> {
  const today = aucklandDateISO();
  const date = movementCivilDay(input.trade_date || input.executed_at, today);
  const fromHoldingEdit = !!opts.fromHoldingEdit;
  const ticker = normalizeTicker(input.ticker || "");
  const assetType: TxAssetType = input.asset_type || "stock";
  const hasTicker = Boolean(ticker);
  const ideaOnly =
    (input.type === "buy" || input.type === "sell") &&
    (input.execution_status === "idea" || input.execution_status === "paper");

  if (ideaOnly) {
    return assessMovement({
      type: input.type,
      date,
      today,
      quantity: Number(input.quantity) || 0,
      price: Number(input.price) || 0,
      held: Number.POSITIVE_INFINITY,
      hasAsset: hasTicker,
      cashKnown: true,
      cashAfterNzd: 0,
      cashChangeNzd: 0,
      needsCash: false,
      fromHoldingEdit,
    });
  }

  const fallbackCash = typeof user.cash_balance === "number" ? user.cash_balance : 0;
  const cash = await readUserCash(user._id, fallbackCash);
  const openingCash = input.type === "opening_balance" && !hasTicker;
  const cashLine =
    input.type === "deposit" ||
    input.type === "withdraw" ||
    input.type === "dividend" ||
    input.type === "tax" ||
    openingCash;

  let held = 0;
  let purchaseDate: string | null = null;
  if (hasTicker && (input.type === "sell" || input.type === "dividend" || input.type === "correction" || input.type === "buy")) {
    const existing = await findHolding(user._id, ticker, assetType);
    held = Number(existing?.shares) || 0;
    purchaseDate = existing?.purchase_date ? String(existing.purchase_date) : null;
    if (input.type === "dividend" && !(held > 0) && (ticker === "GOLD" || ticker === "SILVER")) {
      const metalKey = ticker === "GOLD" ? "gold" : "silver";
      const metals = await totalumSdk.crud.query("precious_metal", {
        _filter: { user: user._id },
        _limit: 50,
      });
      const ounces = ((metals?.data as Array<{ metal?: string; ounces?: number }>) || []).find(
        (row) => String(row.metal || "").toLowerCase() === metalKey && Number(row.ounces) > 0
      );
      if (ounces) held = Number(ounces.ounces) || 0;
    }
  }

  const firstBuyDate =
    input.type === "sell" && ticker ? await earliestBuyDay(user._id, ticker, purchaseDate) : null;
  const price = cashLine ? Number(input.amount) || 0 : Number(input.price) || 0;
  const quantity = Number(input.quantity) || 0;
  const currency = cashLine ? "NZD" : currencyForTicker(ticker || "X", assetType);
  let fxRate = input.fx_rate;
  if (!cashLine && currency !== "NZD" && !(fxRate && fxRate > 0)) {
    try {
      const fx = await getFxSnapshot();
      fxRate = fx.ratesToNZD[currency];
    } catch (err) {
      console.error("[transactions] FX snapshot for the movement check failed:", err);
    }
  }
  const previewHasAsset = input.type === "opening_balance" ? hasTicker : cashLine ? input.type === "dividend" && hasTicker : hasTicker;
  const preview = buildMovementPreview({
    type: input.type,
    date,
    asset: ticker,
    quantity,
    price,
    fee: Math.max(0, Number(input.fees) || 0),
    currency,
    fxRate,
    cashNzd: cash,
    hasAsset: previewHasAsset,
  });

  return assessMovement({
    type: input.type,
    date,
    today,
    quantity,
    price,
    held,
    firstBuyDate,
    hasAsset: previewHasAsset,
    cashKnown: true,
    cashAfterNzd: preview.cashAfterNzd,
    cashChangeNzd: preview.cashChangeNzd,
    needsCash:
      preview.cashChangeNzd < -1e-6 || input.type === "buy" || input.type === "withdraw" || input.type === "tax",
    fromHoldingEdit,
  });
}

/**
 * Apply a transaction: mutate holdings + cash, then write the ledger row.
 * Fills for one account run one at a time. Cash and the holding are re-read
 * inside that lock. If the ledger row cannot be paired with the holding
 * quantity, both writes are undone — a row is never left without its shares.
 */
export async function applyTransaction(
  user: AppUser,
  input: TransactionInput,
  opts?: { fromHoldingEdit?: boolean }
): Promise<TransactionResult> {
  return withUserTradeLock(user._id, () => applyTransactionUnlocked(user, input, opts));
}

async function applyTransactionUnlocked(
  user: AppUser,
  input: TransactionInput,
  opts?: { fromHoldingEdit?: boolean }
): Promise<TransactionResult> {
  const rejection = await movementRejectionForUser(user, input, opts);
  if (rejection) throw new Error(rejection);

  const fallbackCash = typeof user.cash_balance === "number" ? user.cash_balance : 0;
  const currentCash = await readUserCash(user._id, fallbackCash);
  const executedAt = input.executed_at ? new Date(input.executed_at) : new Date();
  const notes = (input.notes || "").slice(0, 500);

  // ---------- Cash-only movements (opening balance with a ticker is a holding) ----------
  const openingCash = input.type === "opening_balance" && !String(input.ticker || "").trim();
  if (
    input.type === "deposit" ||
    input.type === "withdraw" ||
    input.type === "dividend" ||
    input.type === "tax" ||
    openingCash
  ) {
    const amount = Math.max(0, Number(input.amount) || 0);
    const fee = Math.max(0, Number(input.fees) || 0);
    if (amount <= 0) throw new Error("Amount must be greater than 0");
    if (input.type === "dividend") {
      const ticker = normalizeTicker(input.ticker || "");
      if (!ticker) throw new Error("A dividend has to be linked to a holding you already have.");
      const assetType: TxAssetType = input.asset_type || "stock";
      const existing = await findHolding(user._id, ticker, assetType);
      const sharesHeld = Number(existing?.shares) || 0;
      if (!(sharesHeld > 0)) {
        const metalKey = ticker === "GOLD" ? "gold" : ticker === "SILVER" ? "silver" : "";
        let metalHeld = false;
        if (metalKey) {
          const metals = await totalumSdk.crud.query("precious_metal", {
            _filter: { user: user._id },
            _limit: 50,
          });
          metalHeld = ((metals?.data as Array<{ metal?: string; ounces?: number }>) || []).some(
            (row) => String(row.metal || "").toLowerCase() === metalKey && Number(row.ounces) > 0
          );
        }
        if (!metalHeld) throw new Error("A dividend has to be linked to a holding you already have.");
      }
    }
    const credits = input.type === "deposit" || input.type === "dividend" || openingCash;
    const delta = credits ? amount - fee : -(amount + fee);
    if ((input.type === "withdraw" || input.type === "tax") && -delta > currentCash + 1e-6) {
      throw new Error(
        input.type === "tax"
          ? "Insufficient cash balance for this tax line"
          : "Insufficient cash balance for this withdrawal"
      );
    }
    const newCash = round(currentCash + delta);
    const assetName =
      input.asset_name ||
      (input.type === "deposit"
        ? "Cash deposit"
        : input.type === "withdraw"
          ? "Cash withdrawal"
          : input.type === "dividend"
            ? "Dividend"
            : openingCash
              ? "Opening balance"
              : "Tax");

    console.log(`[transactions] ${input.type} ${amount} NZD for user ${user._id} → cash ${newCash}`);
    await totalumSdk.crud.editRecordById("user", user._id, { cash_balance: newCash });

    const rec = await totalumSdk.crud.createRecord("transaction", {
      type: input.type,
      ticker: input.ticker ? String(input.ticker).toUpperCase() : undefined,
      asset_type: input.type === "dividend" && input.ticker ? input.asset_type || "stock" : "cash",
      asset_name: assetName,
      quantity: amount,
      price: 1,
      fees: round(fee),
      total: round(delta),
      cash_nzd: round(delta),
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
  let price = Number(input.price) || 0;
  const fees = Math.max(0, Number(input.fees) || 0);
  if (quantity <= 0) throw new Error("Quantity must be greater than 0");
  if (price <= 0) throw new Error("Price must be greater than 0");

  // The panel sends the reviewed day as executed_at. trade_date is optional.
  const tradeDay = movementCivilDay(input.trade_date || input.executed_at, aucklandDateISO());

  // Opening balance and corrections adjust the holding through the ledger.
  // They do not move cash and they do not replace the typed price with today's quote.
  if (input.type === "correction" || input.type === "opening_balance") {
    const currency = currencyForTicker(ticker, assetType);
    await rejectOutOfBandFx(currency, input.fx_rate, tradeDay);
    const existing = await findHolding(user._id, ticker, assetType);
    if (input.type === "correction" && !existing) {
      throw new Error(`You don't hold ${ticker} to correct`);
    }
    const plan = planHoldingCorrection({
      beforeShares: existing?.shares || 0,
      afterShares: input.type === "opening_balance" ? (existing?.shares || 0) + quantity : quantity,
      beforePrice: existing?.purchase_price || 0,
      afterPrice: price,
      note: notes,
    });
    let holdingId: string | null = existing?._id || null;
    if (existing) {
      const nextShares =
        input.type === "opening_balance" ? round((existing.shares || 0) + quantity, 6) : round(quantity, 6);
      const nextAvg =
        input.type === "opening_balance"
          ? nextShares > 0
            ? ((existing.shares || 0) * (existing.purchase_price || 0) + quantity * price) / nextShares
            : price
          : price;
      await totalumSdk.crud.editRecordById("stock", existing._id, {
        shares: nextShares,
        purchase_price: roundFillPrice(nextAvg),
      });
    } else {
      const info = lookupTicker(ticker);
      const created = await totalumSdk.crud.createRecord("stock", {
        ticker,
        asset_type: assetType,
        company_name: input.asset_name || (assetType === "metal" ? metalName(ticker) : info?.name) || ticker,
        sector:
          input.sector ||
          info?.sector ||
          (assetType === "crypto" ? "Digital Assets" : assetType === "metal" ? "Precious Metals" : "Other"),
        shares: round(quantity, 6),
        purchase_price: roundFillPrice(price),
        purchase_date: executedAt.toISOString(),
        current_price: price,
        user: user._id,
      });
      holdingId = created?.data?._id || null;
    }
    const rec = await totalumSdk.crud.createRecord("transaction", {
      type: input.type,
      ticker,
      asset_name: input.asset_name || existing?.company_name || ticker,
      asset_type: assetType,
      quantity: round(quantity, 6),
      price: roundFillPrice(price),
      fees: 0,
      total: 0,
      cash_nzd: 0,
      realized_pnl: 0,
      currency,
      ...fxRateFields(currency, input.fx_rate),
      notes: input.type === "correction" ? plan.notes : notes || "Opening balance",
      executed_at: executedAt,
      user: user._id,
      ...(holdingId ? { stock: holdingId } : {}),
    });
    console.log(`[transactions] ${input.type} ${ticker} qty=${quantity} @ ${price} ${currency} (cash unchanged)`);
    return { transaction: rec?.data, cashBalance: currentCash, realizedNZD: 0, holdingId };
  }

  // Recommendations / ideas must NOT book as filled trades or realized P&L.
  const executionStatus = input.execution_status || "filled";
  if (executionStatus === "idea" || executionStatus === "paper") {
    const notes = appendAuditNote(
      input.notes,
      `${executionStatus.toUpperCase()} recorded — not a broker fill. ${ADVISORY_NOTE}`
    );
    const ideaCurrency = currencyForTicker(ticker, assetType);
    await rejectOutOfBandFx(ideaCurrency, input.fx_rate, tradeDay);
    const rec = await totalumSdk.crud.createRecord("transaction", {
      type: input.type,
      ticker,
      asset_name: input.asset_name || lookupTicker(ticker)?.name || ticker,
      asset_type: assetType,
      quantity: round(quantity, 6),
      price: roundFillPrice(price),
      fill_price: roundFillPrice(price),
      fees: round(fees),
      total: 0,
      realized_pnl: 0,
      realized_price_pnl_nzd: 0,
      realized_fx_pnl_nzd: 0,
      realized_pnl_nzd: 0,
      currency: ideaCurrency,
      fill_currency: ideaCurrency,
      ...fxRateFields(ideaCurrency, input.fx_rate),
      execution_status: executionStatus,
      price_source: input.price_source || "bot_signal",
      signal_price: input.signal_price ?? price,
      mark_price: input.mark_price ?? null,
      order_sizing: input.order_sizing || "units",
      instrument_type: assetType === "crypto" ? "crypto" : assetType === "metal" ? "metal" : "equity",
      venue: venueForTicker(ticker, assetType),
      asset_id: assetType === "crypto" ? input.coingecko_id || canonicalCryptoId(ticker) : (feedEntryForTicker(ticker)?.providerId || ticker),
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
      const quotes = await fetchCryptoQuotes(
        [ticker],
        input.coingecko_id
          ? { ids: { [ticker.toUpperCase()]: input.coingecko_id }, strictCoinGecko: [ticker] }
          : undefined
      );
      liveSpot = quotes[ticker.toUpperCase()]?.price ?? null;
      // Majors that already match the coin list skip this. A DEX fill uses GeckoTerminal
      // when the coin list is missing or further from the reviewed price than 15%.
      const coinAgrees =
        liveSpot != null && liveSpot > 0 && Math.abs(price / liveSpot - 1) <= SANITY_RATIO_SOFT;
      if (!coinAgrees) {
        try {
          const rows = await dexQuoteRows(ticker);
          const dex = dexPriceForSymbol(ticker, rows);
          if (dex != null && dex > 0) {
            const nearerDex =
              !(liveSpot != null && liveSpot > 0) ||
              Math.abs(price / dex - 1) < Math.abs(price / liveSpot - 1);
            if (nearerDex) liveSpot = dex;
          }
        } catch (dexErr) {
          console.error(`[transactions] DEX spot for sanity check failed (${ticker}):`, dexErr);
        }
      }
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

  // The reviewed price is the fill. A newer live spot is only the sanity check.
  price = priceForBooking(price, liveSpot);

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
  const historicalFx = await historicalNzdPerUnit(currency, tradeDay);
  const fxCheck = reviewedFxAllowed({
    currency,
    reviewed: input.fx_rate,
    snapshot: fx.ratesToNZD[currency],
    historical: historicalFx,
  });
  if (fxCheck.ok === false) throw new Error(fxCheck.message);
  const rates = ratesForBooking(currency, input.fx_rate, fx.ratesToNZD);

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

    const moved = applyPaperCashMove({
      side: "buy",
      quantity,
      price,
      fees,
      currency,
      rates,
      cashNZD: currentCash,
      shares: holding?.shares || 0,
    });
    if (!moved.ok) throw new Error(moved.error || `${ticker} live price unavailable`);
    const costNZD = round(-moved.cashDeltaNZD);
    if (costNZD > currentCash + 1e-6) {
      throw new Error(
        `Insufficient cash — this buy needs NZ$${costNZD.toFixed(2)} and you have NZ$${currentCash.toFixed(2)} available.`
      );
    }
    let holdingId: string;

    if (holding) {
      const oldShares = holding.shares || 0;
      const oldAvg = holding.purchase_price || 0;
      const newShares = oldShares + quantity;
      // New weighted-average cost includes fees so cost basis stays honest.
      const newAvg = newShares > 0 ? (oldShares * oldAvg + quantity * price + fees) / newShares : price;
      const keptDay = earlierCivilDay(
        holding.purchase_date,
        movementCivilDay(executedAt.toISOString(), aucklandDateISO())
      );
      await totalumSdk.crud.editRecordById("stock", holding._id, {
        shares: round(newShares, 6),
        purchase_price: roundFillPrice(newAvg),
        purchase_date: keptDay,
      });
      holdingId = holding._id;
      console.log(`[transactions] BUY ${quantity} ${ticker} → ${newShares} @ avg ${round(newAvg, 4)} (${currency})`);
    } else {
      // New position — resolve a live current price so the P&L is meaningful.
      const info = lookupTicker(ticker);
      let current_price = referencePrice(ticker, price);
      try {
        if (assetType === "crypto") {
          const quotes = await fetchCryptoQuotes(
            [ticker],
            input.coingecko_id
              ? { ids: { [ticker.toUpperCase()]: input.coingecko_id }, strictCoinGecko: [ticker] }
              : undefined
          );
          const live = normaliseUnitPrice(quotes[ticker.toUpperCase()]?.price);
          if (live) current_price = live;
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
        purchase_price: roundFillPrice(avgWithFees),
        purchase_date: executedAt.toISOString(),
        current_price,
        user: user._id,
      });
      holdingId = created?.data?._id;
      console.log(`[transactions] BUY opened new position ${ticker} (${quantity} @ ${price} ${currency})`);
    }

    const newCash = moved.cashNZD;
    const createdNew = !holding;
    const previousShares = round(holding?.shares || 0, 6);
    const previousAvg = roundUnitPrice(holding?.purchase_price || 0);
    const expectedShares = moved.shares;
    let ledgerId: string | undefined;
    try {
    await totalumSdk.crud.editRecordById("user", user._id, { cash_balance: newCash });

    const feed = feedEntryForTicker(ticker);
    const fxRate = nzdPerUnit(currency, input.fx_rate ?? rates[currency] ?? 1);
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
      asset_id: assetType === "crypto" ? input.coingecko_id || canonicalCryptoId(ticker) : (feed?.providerId || ticker),
      quantity: round(quantity, 6),
      price: roundFillPrice(price),
      fill_price: roundFillPrice(price),
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
      fees_nzd: round(nativeToNzd(fees, currency, rates)),
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
    ledgerId = (rec?.data as { _id?: string } | undefined)?._id;
    if (holdingId) {
      let actual = await readHoldingShares(holdingId);
      if (!qtyMatches(actual, expectedShares)) {
        await totalumSdk.crud.editRecordById("stock", holdingId, { shares: expectedShares });
        actual = await readHoldingShares(holdingId);
      }
      if (!qtyMatches(actual, expectedShares)) {
        throw new Error(
          `Buy of ${ticker} was not saved — the holding quantity did not match the ledger, so nothing was committed.`
        );
      }
    }
    return { transaction: rec?.data, cashBalance: newCash, realizedNZD: 0, holdingId };
    } catch (err) {
      console.error(`[transactions] Rolling back buy of ${ticker}:`, err);
      if (ledgerId) {
        await totalumSdk.crud.deleteRecordById("transaction", ledgerId).catch((rollbackErr) => {
          console.error("[transactions] Failed to remove unpaired buy ledger row:", rollbackErr);
        });
      }
      await totalumSdk.crud
        .editRecordById("user", user._id, { cash_balance: currentCash })
        .catch((rollbackErr) => console.error("[transactions] Failed to restore cash after buy:", rollbackErr));
      if (holdingId && createdNew) {
        await totalumSdk.crud.deleteRecordById("stock", holdingId).catch(() => undefined);
      } else if (holdingId) {
        await totalumSdk.crud
          .editRecordById("stock", holdingId, { shares: previousShares, purchase_price: previousAvg })
          .catch(() => undefined);
      }
      throw err instanceof Error ? err : new Error("Buy was not saved");
    }
  }

  // ---- SELL ----
  if (!holding) throw new Error(`You don't hold ${ticker} to sell`);
  const heldShares = holding.shares || 0;
  if (quantity > heldShares + 1e-6) {
    throw new Error(`You only hold ${formatQuantity(heldShares)} unit(s) of ${ticker}`);
  }
  const avgCost = holding.purchase_price || 0;
  const realizedNative = quantity * (price - avgCost) - fees;
  const sold = applyPaperCashMove({
    side: "sell",
    quantity,
    price,
    fees,
    currency,
    rates,
    cashNZD: currentCash,
    shares: heldShares,
  });
  if (!sold.ok) throw new Error(sold.error || `${ticker} live price unavailable`);
  const proceedsNZD = sold.cashDeltaNZD;
  if (proceedsNZD < -1e-6 && sold.cashNZD < -1e-6) {
    throw new Error("This would take cash below zero.");
  }
  // FIFO-style split: price P&L at sell FX; FX P&L vs lot FX (legacy avg uses buy FX ≈ current if unknown).
  const sellFx = nzdPerUnit(currency, input.fx_rate ?? rates[currency] ?? 1);
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
  const legacyRealizedNZD = round(nativeToNzd(realizedNative, currency, rates));
  const realizedBooked = Math.abs(sellFx - lotFx) < 1e-9 ? legacyRealizedNZD : realizedNZD;

  const closed = sold.shares <= 1e-6;
  const expectedRemaining = sold.shares;
  let holdingId: string | null = holding._id;
  let ledgerId: string | undefined;
  const newCash = sold.cashNZD;
  try {
  if (closed) {
    // Position fully closed — remove it from the tracked holdings and retire alerts.
    await totalumSdk.crud.deleteRecordById("stock", holding._id);
    holdingId = null;
    await archiveClosedPositionAlerts(user._id, ticker, 0);
    console.log(`[transactions] SELL closed position ${ticker} (${quantity} @ ${price} ${currency})`);
  } else {
    await totalumSdk.crud.editRecordById("stock", holding._id, { shares: expectedRemaining });
    console.log(`[transactions] SELL ${quantity} ${ticker} → ${expectedRemaining} remaining`);
  }

  await totalumSdk.crud.editRecordById("user", user._id, { cash_balance: newCash });

  const rec = await totalumSdk.crud.createRecord("transaction", {
    type: "sell",
    ticker,
    asset_name: input.asset_name || holding.company_name || ticker,
    asset_type: assetType,
    quantity: round(quantity, 6),
    price: roundFillPrice(price),
    fees: round(fees),
    fees_native: round(fees),
    fees_nzd: round(nativeToNzd(fees, currency, rates)),
    total: round(proceedsNZD),
    realized_pnl: realizedBooked,
    realized_price_pnl_nzd: Math.abs(sellFx - lotFx) < 1e-9 ? legacyRealizedNZD : realizedPriceNZD,
    realized_fx_pnl_nzd: Math.abs(sellFx - lotFx) < 1e-9 ? 0 : realizedFxNZD,
    realized_pnl_nzd: realizedBooked,
    fill_price: roundFillPrice(price),
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
  ledgerId = (rec?.data as { _id?: string } | undefined)?._id;
  if (!closed) {
    let actual = await readHoldingShares(holding._id);
    if (!qtyMatches(actual, expectedRemaining)) {
      await totalumSdk.crud.editRecordById("stock", holding._id, { shares: expectedRemaining });
      actual = await readHoldingShares(holding._id);
    }
    if (!qtyMatches(actual, expectedRemaining)) {
      throw new Error(
        `Sell of ${ticker} was not saved — the holding quantity did not match the ledger, so nothing was committed.`
      );
    }
  }
  return { transaction: rec?.data, cashBalance: newCash, realizedNZD: realizedBooked, holdingId };
  } catch (err) {
    console.error(`[transactions] Rolling back sell of ${ticker}:`, err);
    if (ledgerId) {
      await totalumSdk.crud.deleteRecordById("transaction", ledgerId).catch((rollbackErr) => {
        console.error("[transactions] Failed to remove unpaired sell ledger row:", rollbackErr);
      });
    }
    await totalumSdk.crud
      .editRecordById("user", user._id, { cash_balance: currentCash })
      .catch((rollbackErr) => console.error("[transactions] Failed to restore cash after sell:", rollbackErr));
    if (closed) {
      await totalumSdk.crud
        .createRecord("stock", {
          ticker: holding.ticker,
          asset_type: holding.asset_type || assetType,
          company_name: holding.company_name,
          sector: holding.sector,
          shares: round(heldShares, 6),
          purchase_price: roundUnitPrice(avgCost),
          current_price: holding.current_price,
          user: user._id,
        })
        .catch((rollbackErr) => console.error("[transactions] Failed to restore closed holding:", rollbackErr));
    } else {
      await totalumSdk.crud
        .editRecordById("stock", holding._id, { shares: round(heldShares, 6), purchase_price: roundUnitPrice(avgCost) })
        .catch(() => undefined);
    }
    throw err instanceof Error ? err : new Error("Sell was not saved");
  }
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
  return withUserTradeLock(user._id, () => recordMetalTradeUnlocked(user, input));
}

async function recordMetalTradeUnlocked(
  user: AppUser,
  input: {
    side: "buy" | "sell";
    metal: MetalKey;
    ounces: number;
    pricePerOzNZD: number;
    avgCostNZD?: number;
    fees?: number;
    notes?: string;
    executedAt?: Date;
  }
): Promise<MetalTradeResult> {
  const currentCash = await readUserCash(user._id, typeof user.cash_balance === "number" ? user.cash_balance : 0);
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
    const cost = round(gross + fees);
    if (cost > currentCash + 1e-6) {
      throw new Error(
        `Insufficient cash — this buy needs NZ$${cost.toFixed(2)} and you have NZ$${currentCash.toFixed(2)} available.`
      );
    }
    total = round(-cost);
  } else {
    total = round(gross - fees);
    if (total < -1e-6 && round(currentCash + total) < -1e-6) {
      throw new Error("This would take cash below zero.");
    }
    const avg = Number(input.avgCostNZD) || 0;
    realizedNZD = round(ounces * (price - avg) - fees);
  }
  const newCash = round(currentCash + total);

  let ledgerId: string | undefined;
  try {
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
    fx_rate: nzdPerUnit("NZD", 0),
    notes,
    executed_at: executedAt,
    user: user._id,
  });
  ledgerId = (rec?.data as { _id?: string } | undefined)?._id;
  if (!ledgerId) {
    throw new Error(`Metal ${input.side} of ${ticker} did not return a ledger row, so cash was restored.`);
  }
  return { transaction: rec?.data, cashBalance: newCash, realizedNZD };
  } catch (err) {
    console.error(`[transactions] Rolling back metal ${input.side} of ${ticker}:`, err);
    if (ledgerId) {
      await totalumSdk.crud.deleteRecordById("transaction", ledgerId).catch(() => undefined);
    }
    await totalumSdk.crud
      .editRecordById("user", user._id, { cash_balance: currentCash })
      .catch((rollbackErr) => console.error("[transactions] Failed to restore cash after metal trade:", rollbackErr));
    throw err instanceof Error ? err : new Error("Metal trade was not saved");
  }
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
  /** Dividends recorded in the ledger, in NZD. */
  incomeNZD?: number;
}

/** Load a user's ledger plus cash + realized-P&L rollups (all NZD). */
export async function loadLedger(user: AppUser, limit = 60): Promise<TransactionLedger> {
  // Recent rows for the ledger table…
  const recentRes = await totalumSdk.crud.query("transaction", {
    _filter: { user: user._id },
    _sort: { executed_at: "desc", createdAt: "desc" },
    _limit: limit,
  });
  const rows = ((recentRes?.data as unknown as TransactionRow[]) || [])
    .map((r) => ({
      ...r,
      executed_at: (r as any).executed_at || (r as any).createdAt,
    }))
    .sort((a, b) => {
      const ta = new Date(a.executed_at || a.createdAt || 0).getTime();
      const tb = new Date(b.executed_at || b.createdAt || 0).getTime();
      return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
    });
  const cashBalance = await readUserCash(
    user._id,
    typeof user.cash_balance === "number" ? user.cash_balance : 0
  );

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

  const dividendRes = await totalumSdk.crud.query("transaction", {
    _filter: { user: user._id, type: "dividend" },
    _limit: 5000,
  });
  const dividends = (dividendRes?.data as unknown as TransactionRow[]) || [];
  let incomeTotal = 0;
  for (const r of dividends) {
    const amount = Number(r.total);
    if (Number.isFinite(amount)) incomeTotal += Math.abs(amount);
  }

  return {
    transactions: rows,
    cashBalance,
    realizedYtd: round(realizedYtd),
    realizedTotal: round(realizedTotal),
    realizedYtdCount,
    incomeNZD: round(incomeTotal),
  };
}
