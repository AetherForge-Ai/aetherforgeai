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
 * use the trade-date rate or a live snapshot. A timeout does not book the
 * baseline table. Every mutation is logged; nothing is silently swallowed.
 */

import "server-only";
import { totalumSdk } from "@/lib/totalum";
import type { AppUser } from "@/lib/session";
import { currencyForTicker, nzdAtBookRate, ensureNzdPerUsd, ensureNzdPerAud, formatCleanNumber, formatQuantity, normaliseUnitPrice, roundFxRate, roundUnitPrice, type CurrencyCode } from "@/lib/currency";
import { applyFifoToLedgerRows, fifoTotals } from "@/lib/fifo-cost";
import { auditLivePrice, bookingFxDecision, ledgerFxRate, priceForBooking, ratesForBooking, reviewedFxAllowed } from "@/lib/reviewed-book";
import { alertsToArchive, positionIsClosed } from "@/lib/alert-lifecycle";
import { getFxSnapshot, historicalNzdPerUnit } from "@/lib/fx";
import { normalizeTicker, lookupTicker, referencePrice } from "@/lib/market";
import { fetchLivePrice, isLiveDataConfigured } from "@/lib/market-data";
import { confirmCryptoQuote, priceFromSnapshot } from "@/lib/crypto-board-store";
import { confirmMapKey, confirmOnce, withIdempotencyNote } from "@/lib/confirm-once";
import { getMetalsSpot } from "@/lib/metals";
import {
  checkFillSanity,
  aucklandDateISO,
  aucklandDateTimeISO,
  ADVISORY_NOTE,
  type PriceSource,
  type ExecutionStatus,
  type OrderSizing,
} from "@/lib/fill-integrity";
import { chainForTicker } from "@/lib/crypto-board";
import { canonicalCryptoId } from "@/lib/crypto-ids";
import { venueForTicker, fifoApplySell, type FifoLot } from "@/lib/ledger-schema";
import { fifoRemainingCostFx, fifoRemainingQtyFx, fifoStoredForSell, sumRealisedFxNzd } from "@/lib/tax-realised";
import type { TaxLedgerRow } from "@/lib/taxable-income";
import { logLedgerAudit, appendAuditNote } from "@/lib/ledger-audit";
import { feedEntryForTicker } from "@/lib/feed-mapping";
import { withUserTradeLock } from "@/lib/trade-lock";
import { applyPaperCashMove } from "@/lib/paper-cash";
import { planHoldingCorrection } from "@/lib/holding-correction";
import { cleanChain, dexSectorTag, parseDexSector, preserveQuoteStamp, withDexNotes, withQuoteStamp } from "@/lib/dex-source";
import { buildDividendRecord, paymentDateFx, withDividendNotes, type DividendParts } from "@/lib/dividend-ledger";
import { cashFromLedgerRows } from "@/lib/ledger-cash-lines";
import { buildMovementPreview } from "@/lib/movement-preview";
import { assessMovement, earlierCivilDay, exceedsAvailableCash, movementCivilDay } from "@/lib/transaction-rules";
import { dateOnlyInstant, lotCivilDay, resolveExecutedInstant } from "@/lib/executed-at";
import { bookCacheEpoch, invalidateBookCache, readBookCache, writeBookCache } from "@/lib/book-cache";

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
  /**
   * Trade currency from a broker file. Not a stored column.
   * When set, this fill uses it instead of the ticker suffix.
   * NZD skips the exchange-rate band. AUD and USD use the trade-date rate.
   */
  fill_currency?: CurrencyCode;
  fx_timestamp?: string;
  /** Gross dividend in the holding currency. Stored in the notes prefix, not a new column. */
  dividend_gross?: number;
  /** NZ imputation credits in NZ$. */
  dividend_imputation_nzd?: number;
  /** Withholding in the holding currency. */
  dividend_withholding?: number;
  /** DRP reinvestment in the holding currency. Does not change the share count. */
  dividend_drp?: number;
  /** DEX when the member picked a DEX token. Coin-list fills omit this. */
  venue?: string;
  /** Readable chain for a DEX token, such as Ethereum. */
  chain?: string;
  /** Set when the form price was copied from the shared snapshot. */
  quote_origin?: "snapshot";
  /** One Review. Not stored as its own column. Stamped into notes. */
  idempotency_key?: string;
  /**
   * Import confirm only. The ledger row is saved and cash is left for the caller,
   * so the cash write can follow the row and roll back by id.
   */
  deferCash?: boolean;
}

export interface ConfirmStepMs {
  holdings: number;
  quote: number;
  ledger: number;
  cash: number;
  cache: number;
}

export interface TransactionResult {
  transaction: any;
  cashBalance: number; // NZD after the movement
  realizedNZD: number; // realized P&L booked by this movement (sells only)
  holdingId?: string | null; // affected holding (null if fully closed)
  /** Set when deferCash left the cash write to the caller. */
  ledgerId?: string;
  pendingCash?: number;
  previousCash?: number;
  restoreHolding?: () => Promise<void>;
  /** Milliseconds for the confirm steps. The route logs these before it responds. */
  confirmSteps?: ConfirmStepMs;
}

/**
 * DEX source lives in existing columns. stock.sector gets `DEX · <Chain>`.
 * transaction.notes gets a `[DEX:<Chain>] ` prefix. venue and chain are not written.
 */
function dexStamp(
  input: { venue?: string; chain?: string },
  holding?: { venue?: string; chain?: string; sector?: string | null } | null
): { isDex: boolean; chain: string | null; sector: string | null } {
  const tagged = parseDexSector(holding?.sector);
  const isDex = input.venue === "DEX" || holding?.venue === "DEX" || !!tagged;
  if (!isDex) return { isDex: false, chain: null, sector: null };
  const chain = cleanChain(input.chain) || cleanChain(holding?.chain) || tagged?.chain || null;
  return { isDex: true, chain, sector: dexSectorTag(chain) };
}

function stampedTradeNotes(
  body: string,
  ticker: string,
  assetType: string,
  dexChain: string | null,
  isDex: boolean,
  priceAsAt: string
): string {
  const chain = assetType === "crypto" ? dexChain || chainForTicker(ticker) || null : dexChain || null;
  const led = preserveQuoteStamp(withQuoteStamp(body, chain, priceAsAt), chain, priceAsAt);
  return withDexNotes(led, dexChain, isDex);
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
  if (currency === "USD") return roundFxRate(ensureNzdPerUsd(quoted));
  if (currency === "AUD") return roundFxRate(ensureNzdPerAud(quoted));
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

/** Case and a missing asset_type, matched on a holdings list already in hand. */
function holdingFromList(rows: readonly any[], ticker: string, assetType: TxAssetType) {
  const sym = String(ticker || "").toUpperCase();
  if (!sym) return null;
  return (
    rows.find(
      (h) =>
        String(h?.ticker || "").toUpperCase() === sym &&
        (h?.asset_type || "stock") === assetType
    ) || null
  );
}

/**
 * Stored holding rows for a write. One query, matched in memory.
 * The /api/stocks cache is the FIFO book with live prices applied, so a buy
 * must not average or roll back from those figures.
 */
async function loadHoldingsList(userId: string): Promise<any[]> {
  const res = await totalumSdk.crud.query("stock", {
    _filter: { user: userId },
    _limit: 500,
  });
  return (res?.data as any[]) || [];
}

/** Fetch the affected holding for a ticker, tolerating legacy rows w/o asset_type. */
async function findHolding(
  userId: string,
  ticker: string,
  assetType: TxAssetType,
  holdings?: readonly any[] | null
) {
  const rows = holdings ?? (await loadHoldingsList(userId));
  return holdingFromList(rows, ticker, assetType);
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
  opts: {
    fromHoldingEdit?: boolean;
    cashPromise?: Promise<number>;
    holdingPromise?: Promise<{ shares?: number; purchase_date?: string | null } | null>;
  } = {}
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
  const openingCash = input.type === "opening_balance" && !hasTicker;
  const cashLine =
    input.type === "deposit" ||
    input.type === "withdraw" ||
    input.type === "dividend" ||
    input.type === "tax" ||
    openingCash;
  const needsHolding =
    hasTicker && (input.type === "sell" || input.type === "dividend" || input.type === "correction" || input.type === "buy");
  const [cash, existing] = await Promise.all([
    opts.cashPromise ?? readUserCash(user._id, fallbackCash),
    needsHolding ? (opts.holdingPromise ?? findHolding(user._id, ticker, assetType)) : Promise.resolve(null),
  ]);

  let held = 0;
  let purchaseDate: string | null = null;
  if (needsHolding) {
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

  const price = cashLine ? Number(input.amount) || 0 : Number(input.price) || 0;
  const quantity = Number(input.quantity) || 0;
  const currency = cashLine ? "NZD" : currencyForTicker(ticker || "X", assetType);
  let fxRate = input.fx_rate;
  const needsFx = !cashLine && currency !== "NZD" && !(fxRate && fxRate > 0);
  const [firstBuyDate, fxSnap] = await Promise.all([
    input.type === "sell" && ticker ? earliestBuyDay(user._id, ticker, purchaseDate) : Promise.resolve(null),
    needsFx
      ? getFxSnapshot().catch((err) => {
          console.error("[transactions] FX snapshot for the movement check failed:", err);
          return null;
        })
      : Promise.resolve(null),
  ]);
  if (fxSnap) fxRate = fxSnap.ratesToNZD[currency];
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
 * A dividend with a breakdown. Cash credited is net NZ$ (gross − withholding − DRP).
 * The pieces live in the notes prefix. A missing payment-date rate is refused.
 * The baseline FX table is not used.
 */
async function detailedDividendParts(
  input: TransactionInput,
  tradeDay: string
): Promise<{ parts: DividendParts; fxSource: string }> {
  const ticker = normalizeTicker(input.ticker || "");
  const assetType: TxAssetType = input.asset_type || "stock";
  const currency = currencyForTicker(ticker, assetType);
  let fx = paymentDateFx(currency, input.fx_rate);
  let fxSource = "payment-date";
  if (currency === "NZD") {
    fx = 1;
    fxSource = "nzd";
  } else if (input.fx_rate != null && Number(input.fx_rate) > 0) {
    await rejectOutOfBandFx(currency, input.fx_rate, tradeDay);
    fx = paymentDateFx(currency, input.fx_rate);
    fxSource = input.fx_source || "payment-date";
  } else {
    const historical = await historicalNzdPerUnit(currency, tradeDay);
    fx = paymentDateFx(currency, historical);
    fxSource = "historical";
  }
  if (fx == null) throw new Error("Enter the NZD exchange rate for the payment date.");
  const built = buildDividendRecord({
    grossNative: Number(input.dividend_gross),
    imputationNzd: Number(input.dividend_imputation_nzd) || 0,
    withholdingNative: Number(input.dividend_withholding) || 0,
    drpNative: Number(input.dividend_drp) || 0,
    currency,
    fx,
  });
  if (built.ok === false) throw new Error(built.message);
  return { parts: built.parts, fxSource };
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
  opts?: { fromHoldingEdit?: boolean; rejectionChecked?: boolean; priorLedger?: Promise<TransactionLedger | undefined> }
): Promise<TransactionResult> {
  const mapKey = confirmMapKey(user._id, input.idempotency_key);
  const confirmSteps: ConfirmStepMs = { holdings: 0, quote: 0, ledger: 0, cash: 0, cache: 0 };
  return confirmOnce(mapKey, () =>
    withUserTradeLock(user._id, async () => {
      try {
        const result = await applyTransactionUnlocked(user, input, opts, confirmSteps);
        result.confirmSteps = confirmSteps;
        return result;
      } finally {
        const cacheStarted = Date.now();
        invalidateBookCache(user._id);
        confirmSteps.cache = Date.now() - cacheStarted;
      }
    })
  );
}

function stepMs(step: string, started: number, extra = ""): void {
  console.log(`[transactions] step ${step} ${Date.now() - started}ms${extra ? ` ${extra}` : ""}`);
}

/** A timeout is null and is not a rate. A finished lookup keeps its own null. */
function firstWithin<T>(work: Promise<T>, ms: number): Promise<{ value: T | null; timedOut: boolean }> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({ value: null, timedOut: true });
    }, ms);
    work.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ value, timedOut: false });
      },
      () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ value: null, timedOut: true });
      }
    );
  });
}

function scheduleSnapshotRevalue(holdingId: string | null | undefined, ticker: string, coinId?: string): void {
  if (!holdingId) return;
  const started = Date.now();
  void priceFromSnapshot({ symbol: ticker, coinId })
    .then(async (snap) => {
      if (!snap || !(snap.price > 0)) {
        stepMs("revalue", started, `ticker=${ticker} skipped`);
        return;
      }
      const next = normaliseUnitPrice(snap.price) ?? snap.price;
      await totalumSdk.crud.editRecordById("stock", holdingId, { current_price: next });
      stepMs("revalue", started, `ticker=${ticker}`);
    })
    .catch((err) => {
      console.error(`[transactions] revalue ${ticker} failed:`, err instanceof Error ? err.message.slice(0, 80) : "failed");
    });
}

async function applyTransactionUnlocked(
  user: AppUser,
  input: TransactionInput,
  opts?: { fromHoldingEdit?: boolean; rejectionChecked?: boolean; priorLedger?: Promise<TransactionLedger | undefined> },
  confirmSteps: ConfirmStepMs = { holdings: 0, quote: 0, ledger: 0, cash: 0, cache: 0 }
): Promise<TransactionResult> {
  const checkStarted = Date.now();
  // Cash and the holding are read once and shared with the movement check.
  const fallbackCash = typeof user.cash_balance === "number" ? user.cash_balance : 0;
  const cashPromise = readUserCash(user._id, fallbackCash);
  const sharedTicker = normalizeTicker(input.ticker || "");
  const sharedAsset: TxAssetType = input.asset_type || "stock";
  const holdingsStarted = Date.now();
  const holdingsListPromise = (
    sharedTicker ? loadHoldingsList(user._id) : Promise.resolve([] as any[])
  ).finally(() => {
    confirmSteps.holdings = Date.now() - holdingsStarted;
  });
  const holdingPromise = holdingsListPromise.then((rows) =>
    sharedTicker ? holdingFromList(rows, sharedTicker, sharedAsset) : null
  );
  const rejectionOpts = { ...opts, cashPromise, holdingPromise };
  // The movement check runs beside the booking reads. rejectionChecked skips a second pass.
  const rejectionPromise = rejectionOpts.rejectionChecked
    ? Promise.resolve(null as string | null)
    : movementRejectionForUser(user, input, rejectionOpts);
  let rejectionLogged = false;
  const takeRejection = async (): Promise<string | null> => {
    const rejection = await rejectionPromise;
    if (!rejectionLogged) {
      rejectionLogged = true;
      stepMs("movement-check", checkStarted, opts?.rejectionChecked ? "already-checked" : "overlapped");
    }
    return rejection;
  };

  const resolved = resolveExecutedInstant(input.executed_at);
  const executedStored = resolved.stored;
  const notes = withIdempotencyNote(input.notes || "", input.idempotency_key);
  const tradeDay = input.trade_date ? movementCivilDay(input.trade_date, resolved.civilDay) : resolved.civilDay;
  const statedCurrency = input.fill_currency;
  const bookingCurrency: CurrencyCode =
    statedCurrency === "NZD" || statedCurrency === "AUD" || statedCurrency === "USD"
      ? statedCurrency
      : currencyForTicker(sharedTicker || "X", sharedAsset);
  const datedFx =
    input.type === "buy" || input.type === "sell" || input.type === "opening_balance" || input.type === "correction";
  // The trade-date rate starts with cash and the holding. It is not fetched again later.
  const reviewedFx = Number(input.fx_rate);
  const historicalCap = Number.isFinite(reviewedFx) && reviewedFx > 0 ? 250 : 1200;
  const historicalPromise =
    !datedFx || bookingCurrency === "NZD"
      ? Promise.resolve({ value: bookingCurrency === "NZD" ? (1 as number | null) : null, timedOut: false })
      : firstWithin(historicalNzdPerUnit(bookingCurrency, tradeDay), historicalCap);

  // ---------- Cash-only movements (opening balance with a ticker is a holding) ----------
  const openingCash = input.type === "opening_balance" && !String(input.ticker || "").trim();
  if (
    input.type === "deposit" ||
    input.type === "withdraw" ||
    input.type === "dividend" ||
    input.type === "tax" ||
    openingCash
  ) {
    const [currentCash, rejection] = await Promise.all([cashPromise, takeRejection()]);
    if (rejection) throw new Error(rejection);
    let amount = Math.max(0, Number(input.amount) || 0);
    let fee = Math.max(0, Number(input.fees) || 0);
    let dividendParts: DividendParts | null = null;
    let dividendFxSource: string | undefined;
    if (input.type === "dividend" && input.dividend_gross != null) {
      const tradeDay = movementCivilDay(input.executed_at, aucklandDateISO());
      const detailed = await detailedDividendParts(input, tradeDay);
      dividendParts = detailed.parts;
      dividendFxSource = detailed.fxSource;
      amount = detailed.parts.netCashNzd;
      fee = 0;
    }
    if (amount <= 0 && !dividendParts) throw new Error("Amount must be greater than 0");
    if (input.type === "dividend") {
      const ticker = normalizeTicker(input.ticker || "");
      if (!ticker) throw new Error("A dividend has to be linked to a holding you already have.");
      const assetType: TxAssetType = input.asset_type || "stock";
      const existing = holdingFromList(await holdingsListPromise, ticker, assetType);
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
    if ((input.type === "withdraw" || input.type === "tax") && exceedsAvailableCash(-delta, currentCash)) {
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
    const cashRecord = {
      type: input.type,
      ticker: input.ticker ? String(input.ticker).toUpperCase() : undefined,
      asset_type: input.type === "dividend" && input.ticker ? input.asset_type || "stock" : "cash",
      asset_name: assetName,
      quantity: dividendParts ? dividendParts.grossNative : amount,
      price: 1,
      fees: round(fee),
      total: round(delta),
      cash_nzd: round(delta),
      realized_pnl: 0,
      currency: dividendParts ? dividendParts.currency : "NZD",
      ...(dividendParts ? { fx_rate: dividendParts.fx, fx_source: dividendFxSource } : {}),
      notes: dividendParts ? withDividendNotes(notes, dividendParts) : notes,
      executed_at: executedStored,
      user: user._id,
    };
    if (input.deferCash) {
      const rec = await totalumSdk.crud.createRecord("transaction", cashRecord);
      const ledgerId = (rec?.data as { _id?: string } | undefined)?._id;
      if (!ledgerId) throw new Error("The cash row was not saved");
      return {
        transaction: rec?.data,
        cashBalance: currentCash,
        pendingCash: newCash,
        previousCash: currentCash,
        realizedNZD: 0,
        holdingId: null,
        ledgerId,
      };
    }
    await totalumSdk.crud.editRecordById("user", user._id, { cash_balance: newCash });
    const rec = await totalumSdk.crud.createRecord("transaction", cashRecord);
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

  // Opening balance and corrections adjust the holding through the ledger.
  // They do not move cash and they do not replace the typed price with today's quote.
  if (input.type === "correction" || input.type === "opening_balance") {
    const [currentCash, rejection] = await Promise.all([cashPromise, takeRejection()]);
    if (rejection) throw new Error(rejection);
    const currency = currencyForTicker(ticker, assetType);
    await rejectOutOfBandFx(currency, input.fx_rate, tradeDay);
    const existing = holdingFromList(await holdingsListPromise, ticker, assetType);
    if (input.type === "correction" && !existing) {
      throw new Error(`You don't hold ${ticker} to correct`);
    }
    const plan = planHoldingCorrection({
      beforeShares: existing?.shares || 0,
      afterShares: input.type === "opening_balance" ? (existing?.shares || 0) + quantity : quantity,
      beforePrice: existing?.purchase_price || 0,
      afterPrice: price,
      currency,
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
        purchase_date: dateOnlyInstant(resolved.civilDay),
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
      executed_at: executedStored,
      user: user._id,
      ...(holdingId ? { stock: holdingId } : {}),
    });
    console.log(`[transactions] ${input.type} ${ticker} qty=${quantity} @ ${price} ${currency} (cash unchanged)`);
    return { transaction: rec?.data, cashBalance: currentCash, realizedNZD: 0, holdingId };
  }

  // Recommendations / ideas must NOT book as filled trades or realized P&L.
  const executionStatus = input.execution_status || "filled";
  if (executionStatus === "idea" || executionStatus === "paper") {
    const [currentCash, rejection] = await Promise.all([cashPromise, takeRejection()]);
    if (rejection) throw new Error(rejection);
    const stamp = dexStamp(input, null);
    const notes = withDexNotes(
      appendAuditNote(
        input.notes,
        `${executionStatus.toUpperCase()} recorded — not a broker fill. ${ADVISORY_NOTE}`
      ),
      stamp.chain,
      stamp.isDex
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
      trade_datetime: resolved.hasClock ? aucklandDateTimeISO(resolved.instant) : String(resolved.stored),
      notes,
      executed_at: executedStored,
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

  const currency = bookingCurrency;
  const fxLivePromise = firstWithin(getFxSnapshot(), 450);
  const dupPromise =
    input.type === "buy"
      ? totalumSdk.crud.query("transaction", {
          _filter: { user: user._id, type: "buy", ticker },
          _limit: 8,
          _order: "-executed_at",
        })
      : Promise.resolve(null);
  const historyPromise =
    input.type === "sell"
      ? opts?.priorLedger
        ? opts.priorLedger.then((book) => ({ data: book?.transactions ?? [] }))
        : totalumSdk.crud.query("transaction", {
            _filter: { user: user._id },
            _limit: 5000,
          })
      : Promise.resolve(null);

  // Cash, the holding, FX, and the snapshot price share one wait.
  // Crypto uses the shared snapshot and does not cold-seed it.
  const confirmQuote: { at: string | null } = { at: null };
  const spotStarted = Date.now();
  const spotPromise = (async (): Promise<number | null> => {
    try {
      if (assetType === "crypto") {
        const snap = await confirmCryptoQuote({ symbol: ticker, coinId: input.coingecko_id });
        if (snap?.quotedAt) confirmQuote.at = snap.quotedAt;
        return snap && snap.price > 0 ? snap.price : null;
      }
      if (assetType === "metal") {
        const key = metalKeyForTicker(ticker);
        if (!key) return null;
        const spot = await getMetalsSpot();
        return spot[key]?.nzdPerOz ?? null;
      }
      if (isLiveDataConfigured()) return (await fetchLivePrice(ticker)) || null;
      return null;
    } catch (err) {
      console.error(`[transactions] Live spot for sanity check failed (${ticker}):`, err);
      return null;
    } finally {
      confirmSteps.quote = Date.now() - spotStarted;
    }
  })();
  const [currentCash, holding, recentBuys, snapped, fxLive, historicalFx, rejection, sellHistory] = await Promise.all([
    cashPromise,
    holdingPromise,
    dupPromise,
    spotPromise,
    fxLivePromise,
    historicalPromise,
    takeRejection(),
    historyPromise,
  ]);
  if (rejection) throw new Error(rejection);
  stepMs("confirm-reads", spotStarted, `asset=${assetType}`);
  // live= is a server price only: the snapshot for crypto, or the equity or
  // metal quote fetched above. quote_origin is client-controlled, so the fill
  // is never written as live=.
  const liveSpot = snapped != null && snapped > 0 ? snapped : null;
  const auditSpot = liveSpot;
  const auditLive = auditLivePrice(auditSpot);
  const liveAuditText = auditLive == null ? "live=n/a" : `live=${formatCleanNumber(auditLive)}`;

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
    fillCurrency: currency,
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

  const fxDecision = bookingFxDecision({
    currency,
    reviewed: input.fx_rate,
    snapshot: fxLive.value,
    historical: historicalFx.value,
  });
  if (fxDecision.ok === false) throw new Error(fxDecision.message);
  const fx = { ratesToNZD: fxDecision.ratesToNZD };
  const rates = ratesForBooking(currency, input.fx_rate, fx.ratesToNZD);

  // ---- BUY ----
  if (input.type === "buy") {
    // Accidental double-submit guard: identical buy within 45s returns the prior row.
    // An import uses the file hash instead, and must not skip the cash step.
    if (!input.deferCash) try {
      const now = Date.now();
      const dup = ((recentBuys?.data as any[]) || []).find((t) => {
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
    if (exceedsAvailableCash(costNZD, currentCash)) {
      throw new Error(
        `Insufficient cash — this buy needs NZ$${costNZD.toFixed(2)} and you have NZ$${currentCash.toFixed(2)} available.`
      );
    }
    let holdingId: string;
    const stamp = dexStamp(input, holding);
    let holdingWrite: Promise<unknown> = Promise.resolve();

    if (holding) {
      const oldShares = holding.shares || 0;
      const oldAvg = holding.purchase_price || 0;
      const newShares = oldShares + quantity;
      // New weighted-average cost includes fees so cost basis stays honest.
      const newAvg = newShares > 0 ? (oldShares * oldAvg + quantity * price + fees) / newShares : price;
      const keptDay = earlierCivilDay(lotCivilDay(holding.purchase_date) || null, resolved.civilDay);
      // The id is already known, so the holding edit shares the ledger write.
      holdingWrite = totalumSdk.crud.editRecordById("stock", holding._id, {
        shares: round(newShares, 6),
        purchase_price: roundFillPrice(newAvg),
        purchase_date: dateOnlyInstant(keptDay),
        ...(stamp.sector ? { sector: stamp.sector } : {}),
      });
      holdingId = holding._id;
      console.log(`[transactions] BUY ${quantity} ${ticker} → ${newShares} @ avg ${round(newAvg, 4)} (${currency})`);
    } else {
      // New position — resolve a live current price so the P&L is meaningful.
      const info = lookupTicker(ticker);
      const current_price =
        liveSpot != null && liveSpot > 0
          ? liveSpot
          : assetType === "crypto"
            ? price
            : referencePrice(ticker, price);
      const avgWithFees = (quantity * price + fees) / quantity;
      const created = await totalumSdk.crud.createRecord("stock", {
        ticker,
        asset_type: assetType,
        company_name:
          input.asset_name || (assetType === "metal" ? metalName(ticker) : info?.name) || ticker,
        sector:
          stamp.sector ||
          input.sector ||
          info?.sector ||
          (assetType === "crypto" ? "Digital Assets" : assetType === "metal" ? "Precious Metals" : "Other"),
        shares: round(quantity, 6),
        purchase_price: roundFillPrice(avgWithFees),
        purchase_date: dateOnlyInstant(resolved.civilDay),
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
    const feed = feedEntryForTicker(ticker);
    const fxRate = nzdPerUnit(currency, input.fx_rate ?? rates[currency] ?? 1);
    const priceAsAt = confirmQuote.at || input.price_as_at || new Date().toISOString();
    const buyChain = assetType === "crypto" ? stamp.chain || cleanChain(input.chain) || chainForTicker(ticker) || null : stamp.chain || cleanChain(input.chain) || null;
    const quoteBits = [
      buyChain ? `chain=${buyChain.replace(/\s+/g, "_")}` : "",
      priceAsAt ? `pxat=${priceAsAt.replace(/\s+/g, "")}` : "",
    ].filter(Boolean).join(" ");
    const auditNotes = appendAuditNote(
      notes,
      `FILLED buy qty=${quantity} fill=${formatCleanNumber(price)} ${currency} ${liveAuditText}${quoteBits ? ` ${quoteBits}` : ""} source=${input.price_source || "user_fill"}. ${ADVISORY_NOTE}`
    );
    logLedgerAudit({
      action: "fill_buy",
      ticker,
      userId: user._id,
      quote: auditLive != null ? { source: assetType === "crypto" ? "crypto" : "equity", price: auditLive, as_at: new Date().toISOString() } : undefined,
      meta: { liveLabel: liveAuditText },
      after: { quantity, fill_price: price, cash_nzd: -costNZD, fx_rate: fxRate },
    });
    const ledgerStarted = Date.now();
    // Ledger row and holding write finish before cash. The share read is a
    // separate get after the holding write, and it may run beside the cash write.
    const ledgerWrite = totalumSdk.crud.createRecord("transaction", {
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
      price_as_at: priceAsAt,
      trade_datetime: resolved.hasClock ? aucklandDateTimeISO(resolved.instant) : String(resolved.stored),
      execution_status: "filled",
      order_sizing: input.order_sizing || "units",
      notional_native: round(quantity * price, 6),
      native_notional: round(quantity * price, 6),
      fees_native: round(fees),
      fees_nzd: round(nzdAtBookRate(fees, currency, rates)),
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
      notes: stampedTradeNotes(
        auditNotes,
        ticker,
        assetType,
        stamp.chain,
        stamp.isDex,
        priceAsAt
      ),
      executed_at: executedStored,
      user: user._id,
      ...(holdingId ? { stock: holdingId } : {}),
    });
    const [ledgerResult, holdingResult] = await Promise.allSettled([ledgerWrite, holdingWrite]);
    confirmSteps.ledger = Date.now() - ledgerStarted;
    const rec = ledgerResult.status === "fulfilled" ? ledgerResult.value : undefined;
    ledgerId = (rec?.data as { _id?: string } | undefined)?._id;
    if (ledgerResult.status === "rejected" || holdingResult.status === "rejected" || !ledgerId || !rec) {
      const reason =
        (ledgerResult.status === "rejected" ? ledgerResult.reason : undefined) ??
        (holdingResult.status === "rejected" ? holdingResult.reason : undefined) ??
        new Error("Buy was not saved");
      throw reason instanceof Error ? reason : new Error("Buy was not saved");
    }
    const cashWrite = input.deferCash
      ? Promise.resolve(null)
      : totalumSdk.crud.editRecordById("user", user._id, { cash_balance: newCash });
    const shareRead = holdingId ? readHoldingShares(holdingId) : Promise.resolve(null);
    const [cashResult, shareResult] = await Promise.allSettled([cashWrite, shareRead]);
    const restoreHolding = async () => {
      if (holdingId && createdNew) {
        await totalumSdk.crud.deleteRecordById("stock", holdingId).catch(() => undefined);
      } else if (holdingId) {
        await totalumSdk.crud
          .editRecordById("stock", holdingId, { shares: previousShares, purchase_price: previousAvg })
          .catch(() => undefined);
      }
    };
    if (!input.deferCash && cashResult.status === "rejected") {
      const reason = cashResult.reason instanceof Error ? cashResult.reason : new Error("Cash was not saved");
      throw reason;
    }
    if (holdingId) {
      let actual = shareResult.status === "fulfilled" ? shareResult.value : null;
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
    if (input.deferCash) {
      return {
        transaction: rec?.data,
        cashBalance: currentCash,
        pendingCash: newCash,
        previousCash: currentCash,
        realizedNZD: 0,
        holdingId,
        ledgerId,
        restoreHolding,
      };
    }
    confirmSteps.cash = Date.now() - ledgerStarted;
    return { transaction: rec.data, cashBalance: newCash, realizedNZD: 0, holdingId };
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
  const legacyRealizedNZD = round(nzdAtBookRate(realizedNative, currency, rates));
  let realizedBooked = Math.abs(sellFx - lotFx) < 1e-9 ? legacyRealizedNZD : realizedNZD;
  let bookedPrice = Math.abs(sellFx - lotFx) < 1e-9 ? legacyRealizedNZD : realizedPriceNZD;
  let bookedFx = Math.abs(sellFx - lotFx) < 1e-9 ? 0 : realizedFxNZD;
  const fifoStarted = Date.now();
  try {
    const prior = ((sellHistory?.data as unknown as TaxLedgerRow[]) || []).filter((row) => row && row.type);
    const fromLots = fifoStoredForSell(prior, {
      type: "sell",
      ticker,
      asset_type: assetType,
      quantity,
      price,
      fees,
      fees_nzd: round(nzdAtBookRate(fees, currency, rates)),
      currency,
      fx_rate: sellFx,
      executed_at: String(executedStored),
    });
    if (fromLots) {
      bookedPrice = fromLots.pricePnlNzd;
      bookedFx = fromLots.fxPnlNzd;
      realizedBooked = fromLots.realisedNzd;
    }
  } catch (err) {
    console.error("[transactions] FIFO lot read failed, keeping the average-cost figure:", err);
  }
  stepMs("fifo-lots", fifoStarted);

  const stamp = dexStamp(input, holding);
  const closed = sold.shares <= 1e-6;
  const expectedRemaining = sold.shares;
  let holdingId: string | null = holding._id;
  let ledgerId: string | undefined;
  const newCash = sold.cashNZD;
  let holdingWrite: Promise<unknown> = Promise.resolve();
  try {
  if (closed) {
    // Position fully closed — remove it from the tracked holdings and retire alerts.
    holdingWrite = totalumSdk.crud.deleteRecordById("stock", holding._id).then(() =>
      archiveClosedPositionAlerts(user._id, ticker, 0)
    );
    holdingId = null;
    console.log(`[transactions] SELL closed position ${ticker} (${quantity} @ ${price} ${currency})`);
  } else {
    holdingWrite = totalumSdk.crud.editRecordById("stock", holding._id, {
      shares: expectedRemaining,
      ...(stamp.sector ? { sector: stamp.sector } : {}),
    });
    console.log(`[transactions] SELL ${quantity} ${ticker} → ${expectedRemaining} remaining`);
  }

  const priceAsAt = confirmQuote.at || input.price_as_at || new Date().toISOString();
  const sellChain = assetType === "crypto" ? stamp.chain || cleanChain(input.chain) || chainForTicker(ticker) || null : stamp.chain || cleanChain(input.chain) || null;
  const sellQuoteBits = [
    sellChain ? `chain=${sellChain.replace(/\s+/g, "_")}` : "",
    priceAsAt ? `pxat=${priceAsAt.replace(/\s+/g, "")}` : "",
  ].filter(Boolean).join(" ");
  logLedgerAudit({
    action: "fill_sell",
    ticker,
    userId: user._id,
    quote: auditLive != null ? { source: assetType === "crypto" ? "crypto" : "equity", price: auditLive, as_at: new Date().toISOString() } : undefined,
    meta: { liveLabel: liveAuditText },
    after: { quantity, fill_price: price },
  });
  const ledgerStarted = Date.now();
  // Ledger row and holding write finish before cash. The share read is a
  // separate get after the holding write, and it may run beside the cash write.
  const ledgerWrite = totalumSdk.crud.createRecord("transaction", {
    type: "sell",
    ticker,
    asset_name: input.asset_name || holding.company_name || ticker,
    asset_type: assetType,
    quantity: round(quantity, 6),
    price: roundFillPrice(price),
    fees: round(fees),
    fees_native: round(fees),
    fees_nzd: round(nzdAtBookRate(fees, currency, rates)),
    total: round(proceedsNZD),
    realized_pnl: realizedBooked,
    realized_price_pnl_nzd: bookedPrice,
    realized_fx_pnl_nzd: bookedFx,
    realized_pnl_nzd: realizedBooked,
    fill_price: roundFillPrice(price),
    fill_currency: currency,
    execution_status: "filled",
    price_source: input.price_source || "user_fill",
    price_as_at: priceAsAt,
    trade_datetime: resolved.hasClock ? aucklandDateTimeISO(resolved.instant) : String(resolved.stored),
    mark_price: liveSpot,
    fx_rate: sellFx,
    cash_nzd: round(proceedsNZD),
    currency,
    notes: stampedTradeNotes(
      appendAuditNote(
        notes,
        `FILLED sell qty=${quantity} fill=${formatCleanNumber(price)} ${currency} ${liveAuditText}${sellQuoteBits ? ` ${sellQuoteBits}` : ""} source=${input.price_source || "user_fill"}. ${ADVISORY_NOTE}`
      ),
      ticker,
      assetType,
      stamp.chain,
      stamp.isDex,
      priceAsAt
    ),
    executed_at: executedStored,
    user: user._id,
    ...(holdingId ? { stock: holdingId } : {}),
  });
  const [ledgerResult, holdingResult] = await Promise.allSettled([ledgerWrite, holdingWrite]);
  confirmSteps.ledger = Date.now() - ledgerStarted;
  const rec = ledgerResult.status === "fulfilled" ? ledgerResult.value : undefined;
  ledgerId = (rec?.data as { _id?: string } | undefined)?._id;
  if (ledgerResult.status === "rejected" || holdingResult.status === "rejected" || !ledgerId || !rec) {
    const reason =
      (ledgerResult.status === "rejected" ? ledgerResult.reason : undefined) ??
      (holdingResult.status === "rejected" ? holdingResult.reason : undefined) ??
      new Error("Sell was not saved");
    throw reason instanceof Error ? reason : new Error("Sell was not saved");
  }
  const cashWrite = input.deferCash
    ? Promise.resolve(null)
    : totalumSdk.crud.editRecordById("user", user._id, { cash_balance: newCash });
  const shareRead = closed ? Promise.resolve(expectedRemaining) : readHoldingShares(holding._id);
  const [cashResult, shareResult] = await Promise.allSettled([cashWrite, shareRead]);
  const restoreHolding = async () => {
    if (closed) {
      await totalumSdk.crud
        .createRecord("stock", {
          ticker: holding.ticker,
          asset_type: holding.asset_type || assetType,
          company_name: holding.company_name,
          sector: stamp.sector || holding.sector,
          shares: round(heldShares, 6),
          purchase_price: roundUnitPrice(avgCost),
          current_price: holding.current_price,
          user: user._id,
        })
        .catch(() => undefined);
    } else {
      await totalumSdk.crud
        .editRecordById("stock", holding._id, { shares: round(heldShares, 6), purchase_price: roundUnitPrice(avgCost) })
        .catch(() => undefined);
    }
  };
  if (!input.deferCash && cashResult.status === "rejected") {
    const reason = cashResult.reason instanceof Error ? cashResult.reason : new Error("Cash was not saved");
    throw reason;
  }
  if (!closed) {
    let actual = shareResult.status === "fulfilled" ? shareResult.value : null;
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
  if (input.deferCash) {
    return {
      transaction: rec?.data,
      cashBalance: currentCash,
      pendingCash: newCash,
      previousCash: currentCash,
      realizedNZD: realizedBooked,
      holdingId,
      ledgerId,
      restoreHolding,
    };
  }
  confirmSteps.cash = Date.now() - ledgerStarted;
  return { transaction: rec.data, cashBalance: newCash, realizedNZD: realizedBooked, holdingId };
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
          sector: stamp.sector || holding.sector,
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
    executedAt?: Date | string;
  }
): Promise<MetalTradeResult> {
  return withUserTradeLock(user._id, async () => {
    try {
      return await recordMetalTradeUnlocked(user, input);
    } finally {
      invalidateBookCache(user._id);
    }
  });
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
    executedAt?: Date | string;
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
  const metalWhen = resolveExecutedInstant(input.executedAt);
  const executedStored = metalWhen.stored;
  const notes = (input.notes || "").slice(0, 500);

  // `total` is the signed cash impact (buys debit, sells credit).
  let total: number;
  let realizedNZD = 0;
  if (input.side === "buy") {
    const cost = round(gross + fees);
    if (exceedsAvailableCash(cost, currentCash)) {
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
    executed_at: executedStored,
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
  trade_date?: string;
  trade_datetime?: string;
}

export interface TransactionLedger {
  transactions: TransactionRow[];
  cashBalance: number;
  realizedYtd: number;
  realizedTotal: number;
  realizedYtdCount: number;
  /** Dividends recorded in the ledger, in NZD. */
  incomeNZD?: number;
  /** Cost-weighted NZD rate still open on each ticker. Read from stored buy rates. */
  costFxByTicker?: Record<string, number>;
  /** Quantity-weighted NZD rate still open on each ticker. */
  qtyFxByTicker?: Record<string, number>;
  /** Unrounded realised FX: Σ quantity closed × buy fill × (sell FX − buy FX). */
  realisedFxNzd?: number;
}

/** One query serves the ledger page and the CSV. Paging happens in the UI. */
const LEDGER_QUERY_LIMIT = 5000;

/**
 * The confirm response reuses the book that was already loading and adds the
 * row that was just written. Cash is the sum of those rows.
 */
export function ledgerAfterBooking(
  prior: TransactionLedger,
  booked: { transaction?: TransactionRow | null; cashBalance: number }
): TransactionLedger {
  const tx = booked.transaction && typeof booked.transaction === "object" ? booked.transaction : null;
  const id = tx?._id ? String(tx._id) : "";
  const existing = prior.transactions || [];
  const fresh = !!(tx && id && !existing.some((row) => String(row._id) === id));
  const transactions = fresh && tx ? [tx, ...existing] : existing;
  const book = transactions as unknown as TaxLedgerRow[];
  const calendarYear = Number(aucklandDateISO().slice(0, 4));
  const fifo = fifoTotals(book, calendarYear);
  const withFifo = applyFifoToLedgerRows(transactions, book);
  const costFxByTicker: Record<string, number> = {};
  const qtyFxByTicker: Record<string, number> = {};
  for (const [ticker, rate] of fifoRemainingCostFx(book)) costFxByTicker[ticker] = rate;
  for (const [ticker, rate] of fifoRemainingQtyFx(book)) qtyFxByTicker[ticker] = rate;
  const realisedFxNzd = sumRealisedFxNzd(book);
  let incomeTotal = 0;
  for (const row of transactions) {
    if (row.type !== "dividend") continue;
    const amount = Number(row.total);
    if (Number.isFinite(amount)) incomeTotal += Math.abs(amount);
  }
  const summed = transactions.length ? cashFromLedgerRows(transactions) : booked.cashBalance;
  // Confirm already wrote this cash. A book that does not contain the opening
  // balance must not replace it with the sum of the trade lines alone.
  const cashBalance =
    Number.isFinite(summed) && Math.abs(summed - booked.cashBalance) < 0.02 ? summed : booked.cashBalance;
  return {
    transactions: withFifo,
    cashBalance,
    realizedYtd: round(fifo.ytd),
    realizedTotal: round(fifo.all),
    realizedYtdCount: fifo.ytdCount,
    incomeNZD: round(incomeTotal),
    costFxByTicker,
    qtyFxByTicker,
    realisedFxNzd,
  };
}

/** Load a user's ledger plus cash + realized-P&L rollups (all NZD). */
export async function loadLedger(user: AppUser, limit = LEDGER_QUERY_LIMIT): Promise<TransactionLedger> {
  const key = `${user._id}:ledger:${limit}`;
  const cached = readBookCache<TransactionLedger>(key);
  if (cached) return cached;
  const epoch = bookCacheEpoch(user._id);
  const ledger = await loadLedgerFresh(user, limit);
  writeBookCache(key, ledger, epoch);
  return ledger;
}

async function loadLedgerFresh(user: AppUser, limit: number): Promise<TransactionLedger> {
  const fallbackCash = typeof user.cash_balance === "number" ? user.cash_balance : 0;
  const cap = Math.min(LEDGER_QUERY_LIMIT, Math.max(1, limit));
  const [bookRes, storedCash] = await Promise.all([
    totalumSdk.crud.query("transaction", {
      _filter: { user: user._id },
      _limit: cap,
    }),
    readUserCash(user._id, fallbackCash),
  ]);
  const bookRows = ((bookRes?.data as unknown as TransactionRow[]) || []).map((r) => ({
    ...r,
    executed_at: (r as any).executed_at || (r as any).createdAt,
  }));
  const rows = [...bookRows].sort((a, b) => {
    const ta = new Date(a.executed_at || a.createdAt || 0).getTime();
    const tb = new Date(b.executed_at || b.createdAt || 0).getTime();
    return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
  });
  const book = bookRows as unknown as TaxLedgerRow[];
  const calendarYear = Number(aucklandDateISO().slice(0, 4));
  const fifo = fifoTotals(book, calendarYear);
  const withFifo = applyFifoToLedgerRows(rows, book);
  const costFxByTicker: Record<string, number> = {};
  const qtyFxByTicker: Record<string, number> = {};
  for (const [ticker, rate] of fifoRemainingCostFx(book)) costFxByTicker[ticker] = rate;
  for (const [ticker, rate] of fifoRemainingQtyFx(book)) qtyFxByTicker[ticker] = rate;
  const realisedFxNzd = sumRealisedFxNzd(book);
  const summed = bookRows.length ? cashFromLedgerRows(bookRows) : storedCash;
  const cashBalance = Math.abs(summed - storedCash) < 0.02 ? summed : storedCash;
  let incomeTotal = 0;
  for (const r of bookRows) {
    if (r.type !== "dividend") continue;
    const amount = Number(r.total);
    if (Number.isFinite(amount)) incomeTotal += Math.abs(amount);
  }

  return {
    transactions: withFifo,
    cashBalance,
    realizedYtd: round(fifo.ytd),
    realizedTotal: round(fifo.all),
    realizedYtdCount: fifo.ytdCount,
    incomeNZD: round(incomeTotal),
    costFxByTicker,
    qtyFxByTicker,
    realisedFxNzd,
  };
}
