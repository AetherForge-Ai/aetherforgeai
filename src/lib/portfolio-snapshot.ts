/**
 * One NZD portfolio snapshot for every dashboard total.
 * FIFO lots, cash replay, income net, and the return split are computed here.
 * A missing price or exchange rate stays blank. Nothing is filled in from a guess.
 * Money is full precision until display (NZ$ at 2dp, FX at 4dp).
 */

import { importRowHash } from "@/lib/broker-import";
import {
  currencyForTicker,
  fifoLotCostNzd,
  formatDisplayDate,
  formatFxInput,
  formatNzd,
  roundMoney,
} from "@/lib/currency";
import { parseDividendNotes } from "@/lib/dividend-ledger";
import { cashFromLedgerRows, ledgerDisplayedCash } from "@/lib/ledger-cash-lines";
import { buyLotDay } from "@/lib/lot-day";
import { isBullionHolding } from "@/lib/metal-valuation";
import { solveXirr, XIRR_ANNUALISE_AFTER_DAYS, type SolverFlow } from "@/lib/performance-math";
import type { ReturnSplit } from "@/lib/returns-split";

export const MISSING_MARK = "—";

export type SnapshotClass = "shares" | "crypto" | "metals" | "cash";

export interface SnapshotMaths {
  formula: string;
  inputs: string[];
  arithmetic: string;
  source: string;
  asOf: string;
}

export interface SnapshotFigure {
  /** Null when an input is missing. Never a guessed number. */
  value: number | null;
  /** NZ$ at 2dp, a percent, an FX rate at 4dp, or an em dash. */
  display: string;
  reason: string | null;
  maths: SnapshotMaths;
}

export interface SnapshotLot {
  acquired: string;
  acquiredLabel: string;
  quantity: number;
  priceLocal: number;
  fx: number | null;
  fxDisplay: string;
  costNzd: number | null;
  feeNzd: number;
}

export interface SnapshotPosition {
  ticker: string;
  name: string;
  assetClass: SnapshotClass;
  /** Open quantity. Closed positions are 0. */
  quantity: number;
  closed: boolean;
  averageCostLocal: number | null;
  marketPriceLocal: number | null;
  currency: string;
  fxNow: number | null;
  fxNowDisplay: string;
  marketValue: SnapshotFigure;
  costBase: SnapshotFigure;
  unrealised: SnapshotFigure;
  unrealisedPrice: SnapshotFigure;
  unrealisedFx: SnapshotFigure;
  realised: SnapshotFigure;
  realisedPrice: SnapshotFigure;
  realisedFx: SnapshotFigure;
  income: SnapshotFigure;
  incomeGross: SnapshotFigure;
  incomeWithholding: SnapshotFigure;
  currencyEffect: SnapshotFigure;
  fees: SnapshotFigure;
  totalReturn: SnapshotFigure;
  weight: SnapshotFigure;
  lots: SnapshotLot[];
  priceSource: string | null;
  priceAsOf: string | null;
  /**
   * Stock or metal-store id when exactly one is known for this ticker.
   * Null when none or more than one was remembered. Not a database column.
   */
  holdingId: string | null;
}

export interface SnapshotGroup {
  id: SnapshotClass;
  label: string;
  marketValue: SnapshotFigure;
  positions: SnapshotPosition[];
}

export interface SnapshotCashLine {
  currency: string;
  amountLocal: number;
  fx: number | null;
  fxDisplay: string;
  valueNzd: number | null;
  fxGainNzd: number | null;
  negative: boolean;
}

export interface SnapshotLedgerLine {
  id: string;
  type: string;
  ticker: string;
  quantity: number | null;
  price: number | null;
  feesNzd: number | null;
  /** Local currency of the fill. NZD, USD, or AUD when the row stored one. */
  currency: string;
  fx: number | null;
  fxDisplay: string;
  cashNzd: number;
  realisedNzd: number | null;
  when: string;
  whenLabel: string;
}

export interface SnapshotFilter {
  assetClass?: SnapshotClass | "all";
  open?: "open" | "closed" | "all";
}

export interface PortfolioSnapshot {
  /** ISO time this snapshot was built. Filters reuse it. */
  asOf: string;
  asOfLabel: string;
  source: string;
  kpis: {
    netWorth: SnapshotFigure;
    holdingsValue: SnapshotFigure;
    cash: SnapshotFigure;
    contributions: SnapshotFigure;
    today: SnapshotFigure;
    totalReturn: SnapshotFigure;
    capital: SnapshotFigure;
    income: SnapshotFigure;
    incomeGross: SnapshotFigure;
    incomeWithholding: SnapshotFigure;
    currency: SnapshotFigure;
    fees: SnapshotFigure;
    realised: SnapshotFigure;
    simplePct: SnapshotFigure;
    annualisedPct: SnapshotFigure;
    benchmark: SnapshotFigure;
  };
  groups: SnapshotGroup[];
  grand: SnapshotFigure;
  cashLines: SnapshotCashLine[];
  /** Booked NZD cash from the ledger rows. Market value of cash can differ once foreign cash is revalued. */
  cashReplayNzd: number;
  cashWarning: string | null;
  ledger: SnapshotLedgerLine[];
  importKeys: string[];
  filteredNote: string | null;
  reconciliation: {
    ok: boolean;
    label: string;
    outBy: number | null;
    invariants: SnapshotInvariant[];
  };
}

export interface SnapshotInvariant {
  id: "I1" | "I2" | "I3" | "I4" | "I5" | "I6" | "I7";
  ok: boolean;
  detail: string;
}

export interface SnapshotMark {
  ticker: string;
  price: number | null;
  currency?: string | null;
  assetType?: string | null;
  name?: string | null;
  reason?: string | null;
  source?: string | null;
  asOf?: string | null;
  /** Stock row id. Omitted when this mark is only a price. */
  holdingId?: string | null;
}

export interface SnapshotExtraPosition {
  id: string;
  ticker: string;
  name?: string | null;
  assetClass: Exclude<SnapshotClass, "cash">;
  quantity: number;
  costPrice: number;
  currency: string;
  /** NZD per 1 unit of currency when the lot was acquired. Null if it was not stored. */
  fxAtCost: number | null;
  markPrice: number | null;
  markReason?: string | null;
  source?: string | null;
  asOf?: string | null;
}

export interface SnapshotLedgerRow {
  _id?: string;
  type?: string | null;
  ticker?: string | null;
  asset_name?: string | null;
  asset_type?: string | null;
  quantity?: number | null;
  price?: number | null;
  fill_price?: number | null;
  fees?: number | null;
  fees_nzd?: number | null;
  total?: number | null;
  cash_nzd?: number | null;
  currency?: string | null;
  fx_rate?: number | null;
  notes?: string | null;
  executed_at?: string | null;
  createdAt?: string | null;
  trade_date?: string | null;
  trade_datetime?: string | null;
  /** Set when this cash movement stayed in `currency` instead of being booked in NZD. */
  cashNative?: number | null;
  brokerRef?: string | null;
}

export interface SnapshotInput {
  rows: readonly SnapshotLedgerRow[];
  marks?: readonly SnapshotMark[];
  extras?: readonly SnapshotExtraPosition[];
  /** NZD per 1 unit. Ignored unless `fxSourced` is true. NZD is always 1. */
  fxNow?: Partial<Record<string, number | null>>;
  /** False when the rate table is a fallback. Foreign marks then stay blank. */
  fxSourced?: boolean;
  fxSource?: string | null;
  fxAsOf?: string | null;
  asOf?: string | null;
  /** Label for prices that did not name a feed. */
  priceSource?: string | null;
  /** Earlier value was not stored, so today's move stays blank unless this is passed. */
  previousNetWorth?: number | null;
  /** Benchmark level change is not invented. Pass a series only when one was loaded. */
  benchmark?: { name: string; portfolioPct: number | null; benchmarkPct: number | null; reason?: string | null } | null;
  period?: { start?: string | null; end?: string | null; label?: string };
  filter?: SnapshotFilter;
}

const CLASS_ORDER: SnapshotClass[] = ["shares", "crypto", "metals", "cash"];
const CLASS_LABEL: Record<SnapshotClass, string> = {
  shares: "Shares & ETFs",
  crypto: "Crypto",
  metals: "Metals",
  cash: "Cash",
};

interface OpenLot {
  qty: number;
  price: number;
  fx: number | null;
  currency: string;
  feePerUnit: number;
  day: string;
  assetClass: Exclude<SnapshotClass, "cash">;
  name: string;
}

interface RealisedPiece {
  id: string;
  ticker: string;
  assetClass: Exclude<SnapshotClass, "cash">;
  name: string;
  quantity: number;
  price: number;
  fx: number;
  fees: number;
  incomplete: boolean;
  reason: string | null;
}

function realisedDisplays(
  price: number,
  fx: number,
  fees: number,
  incomplete: boolean
): { total: number | null; price: number | null; fx: number | null; fees: number | null } {
  if (incomplete) return { total: null, price: null, fx: null, fees: null };
  const total = roundMoney(price + fx + fees);
  const fxPart = roundMoney(fx);
  const feePart = roundMoney(fees);
  return { total, price: roundMoney(total - fxPart - feePart), fx: fxPart, fees: feePart };
}

interface IncomePiece {
  ticker: string;
  assetClass: Exclude<SnapshotClass, "cash">;
  gross: number | null;
  withholding: number | null;
  net: number;
  drp: number;
  legacy: boolean;
}

interface NativeWallet {
  amount: number;
  costNzd: number;
}

function blankMaths(formula: string, reason: string, source: string, asOf: string): SnapshotMaths {
  return { formula, inputs: [reason], arithmetic: MISSING_MARK, source, asOf };
}

function moneyFigure(value: number | null, reason: string | null, maths: SnapshotMaths): SnapshotFigure {
  const rounded = value == null ? null : roundMoney(value);
  return {
    value: rounded,
    display: rounded == null ? MISSING_MARK : formatNzd(rounded),
    reason,
    maths,
  };
}

function percentFigure(ratio: number | null, reason: string | null, maths: SnapshotMaths): SnapshotFigure {
  if (ratio == null || !Number.isFinite(ratio)) {
    return { value: null, display: MISSING_MARK, reason, maths };
  }
  const pct = ratio * 100;
  const rounded = roundMoney(pct);
  return {
    value: ratio,
    display: `${rounded.toFixed(2)}%`,
    reason,
    maths,
  };
}

function fxDisplay(value: number | null): string {
  if (value == null || !(value > 0)) return MISSING_MARK;
  return formatFxInput(value) || MISSING_MARK;
}

function num(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function upper(value: unknown): string {
  return String(value || "").trim().toUpperCase();
}

function currencyOf(row: SnapshotLedgerRow, ticker: string, assetClass: string): string {
  const stored = upper(row.currency);
  if (stored === "NZD" || stored === "USD" || stored === "AUD") return stored;
  return currencyForTicker(ticker, assetClass === "crypto" ? "crypto" : assetClass === "metals" ? "metal" : "stock");
}

function assetClassOf(row: SnapshotLedgerRow, ticker: string): Exclude<SnapshotClass, "cash"> {
  const kind = String(row.asset_type || "").toLowerCase();
  if (kind === "crypto") return "crypto";
  if (kind === "metal" || isBullionHolding(kind, ticker, row.asset_name)) return "metals";
  if (isBullionHolding(kind || "stock", ticker, row.asset_name)) return "metals";
  return "shares";
}

function tradeFx(currency: string, fxRate: unknown): number | null {
  if (currency === "NZD") return 1;
  const fx = num(fxRate);
  if (fx == null || !(fx > 0)) return null;
  if (currency === "USD" && fx < 1) return 1 / fx;
  return fx;
}

function rateNow(
  currency: string,
  fxNow: SnapshotInput["fxNow"],
  fxSourced: boolean
): number | null {
  if (currency === "NZD") return 1;
  if (!fxSourced) return null;
  const raw = fxNow?.[currency];
  if (raw == null || !(Number(raw) > 0)) return null;
  return Number(raw);
}

function feeNzd(row: SnapshotLedgerRow, fx: number | null): number | null {
  if (typeof row.fees_nzd === "number" && Number.isFinite(row.fees_nzd)) return row.fees_nzd;
  const fees = num(row.fees);
  if (fees == null || fees === 0) return 0;
  if (fees < 0 || fx == null) return null;
  return fees * fx;
}

function movementQty(row: SnapshotLedgerRow): number {
  const qty = num(row.quantity);
  if (qty != null && qty > 0) return qty;
  const match = String(row.notes || "").match(/\bqty=([0-9]*\.?[0-9]+)/i);
  const parsed = match ? Number(match[1]) : 0;
  return parsed > 0 ? parsed : 0;
}

function movementPrice(row: SnapshotLedgerRow): number {
  const fill = num(row.fill_price);
  if (fill != null && fill > 0) return fill;
  const price = num(row.price);
  if (price != null && price > 0) return price;
  const match = String(row.notes || "").match(/\bfill=([0-9]*\.?[0-9]+)/i);
  const parsed = match ? Number(match[1]) : 0;
  return parsed > 0 ? parsed : 0;
}

function brokerRefOf(row: SnapshotLedgerRow): string {
  if (row.brokerRef) return String(row.brokerRef).trim();
  const match = String(row.notes || "").match(/(?:^|\s)ref=(\S+)/);
  return match?.[1] || "";
}

/**
 * Same lot order as the stocks FIFO book. Civil day, then the type name
 * (buys before sells). Same day and type keep the order loadLedger returned.
 */
function orderedRows(rows: readonly SnapshotLedgerRow[]): SnapshotLedgerRow[] {
  return [...rows].sort((a, b) => {
    const day = buyLotDay(a).localeCompare(buyLotDay(b));
    if (day) return day;
    return String(a.type || "").localeCompare(String(b.type || ""));
  });
}

function emptyFigure(formula: string, reason: string, source: string, asOf: string): SnapshotFigure {
  return moneyFigure(null, reason, blankMaths(formula, reason, source, asOf));
}

function signedCash(row: SnapshotLedgerRow): number {
  return ledgerDisplayedCash({
    type: row.type,
    total: row.total,
    cash_nzd: row.cash_nzd,
    fees_nzd: row.fees_nzd,
    quantity: row.quantity,
  });
}

function markFor(marks: Map<string, SnapshotMark>, ticker: string): SnapshotMark | null {
  return marks.get(ticker) || null;
}

/** Rounded parts that add to the rounded total. The largest part absorbs the cent. */
function distribute(exacts: number[], target: number): number[] {
  if (!exacts.length) return [];
  const rounded = exacts.map((value) => roundMoney(value));
  let drift = roundMoney(target - rounded.reduce((total, value) => total + value, 0));
  if (drift !== 0) {
    let index = 0;
    for (let i = 1; i < rounded.length; i += 1) {
      if (Math.abs(rounded[i]) > Math.abs(rounded[index])) index = i;
    }
    rounded[index] = roundMoney(rounded[index] + drift);
  }
  return rounded;
}

function figureFrom(
  value: number | null,
  formula: string,
  inputs: string[],
  arithmetic: string,
  source: string,
  asOf: string,
  reason: string | null = null
): SnapshotFigure {
  return moneyFigure(value, reason, { formula, inputs, arithmetic, source, asOf });
}

function daysBetween(start: string, end: string): number | null {
  const a = Date.parse(`${start.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${end.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86400000);
}

export function countNewImportRows(existingKeys: readonly string[], incomingKeys: readonly string[]): number {
  const seen = new Set(existingKeys);
  let added = 0;
  for (const key of incomingKeys) {
    if (seen.has(key)) continue;
    seen.add(key);
    added += 1;
  }
  return added;
}

export function ledgerImportKey(row: {
  date: string;
  side: string;
  ticker: string;
  quantity: number;
  price: number;
  brokerRef?: string;
}): string {
  return importRowHash({
    date: row.date,
    side: row.side,
    ticker: row.ticker,
    quantity: row.quantity,
    price: row.price,
    brokerRef: row.brokerRef,
  });
}

export interface LedgerPage<T> {
  rows: T[];
  page: number;
  pageSize: number;
  total: number;
  from: number;
  to: number;
  pageCount: number;
  showAll: boolean;
  /** For example `1–5 of 13`. */
  label: string;
}

export function pageLedger<T>(
  rows: readonly T[],
  opts: { page?: number; pageSize?: number; showAll?: boolean } = {}
): LedgerPage<T> {
  const total = rows.length;
  const showAll = opts.showAll === true;
  const pageSize = showAll ? Math.max(total, 1) : Math.max(1, Math.floor(opts.pageSize || 25));
  const pageCount = Math.max(1, Math.ceil(total / pageSize) || 1);
  const page = Math.min(pageCount, Math.max(1, Math.floor(opts.page || 1)));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = total === 0 ? 0 : Math.min(total, page * pageSize);
  const slice = showAll || pageSize >= total ? [...rows] : rows.slice(from - 1, to);
  const label = total === 0 ? "0 of 0" : `${from}–${showAll ? total : to} of ${total}`;
  return { rows: slice, page, pageSize: showAll ? total : pageSize, total, from, to, pageCount, showAll, label };
}

export function snapshotAsReturnSplit(snapshot: PortfolioSnapshot): ReturnSplit | null {
  const capital = snapshot.kpis.capital.value;
  const income = snapshot.kpis.income.value;
  const currency = snapshot.kpis.currency.value;
  const fees = snapshot.kpis.fees.value;
  const total = snapshot.kpis.totalReturn.value;
  if (capital == null || income == null || currency == null || fees == null || total == null) return null;
  return {
    capitalGainNzd: capital,
    incomeNzd: income,
    currencyEffectNzd: currency,
    otherNzd: 0,
    feesNzd: fees,
    feesNote: snapshot.kpis.fees.maths.formula,
    totalNzd: total,
    capitalNote: snapshot.kpis.capital.maths.formula,
    incomeNote: snapshot.kpis.income.maths.formula,
    currencyNote: snapshot.kpis.currency.maths.formula,
    otherNote: "The segments already add to the total, so nothing is left over.",
    totalNote: snapshot.kpis.totalReturn.maths.formula,
  };
}

export function filterSnapshot(snapshot: PortfolioSnapshot, filter: SnapshotFilter = {}): PortfolioSnapshot {
  const assetClass = filter.assetClass && filter.assetClass !== "all" ? filter.assetClass : null;
  const open = filter.open || "all";
  const groups = snapshot.groups.map((group) => {
    if (assetClass && group.id !== assetClass) {
      return { ...group, positions: [] as SnapshotPosition[] };
    }
    const positions = group.positions.filter((position) => {
      if (open === "open") return !position.closed && position.quantity > 1e-9;
      if (open === "closed") return position.closed || position.quantity <= 1e-9;
      return true;
    });
    return { ...group, positions };
  });
  const visible = groups.reduce((total, group) => total + group.positions.length, 0);
  const all = snapshot.groups.reduce((total, group) => total + group.positions.length, 0);
  const active = Boolean(assetClass) || open !== "all";
  return {
    ...snapshot,
    groups,
    filteredNote: active ? `Filtered: ${visible} of ${all}` : null,
  };
}

export function checkInvariants(snapshot: PortfolioSnapshot): SnapshotInvariant[] {
  const asOf = snapshot.asOf;
  const net = snapshot.kpis.netWorth.value;
  const grand = snapshot.grand.value;
  const groupValues = snapshot.groups.map((group) => group.marketValue.value);
  const groupsKnown = groupValues.every((value) => value != null);
  const groupSum = groupsKnown ? roundMoney(groupValues.reduce<number>((total, value) => total + (value || 0), 0)) : null;
  const i1ok = net != null && grand != null && net === grand;
  const i2ok = grand != null && groupSum != null && groupSum === grand;

  const capital = snapshot.kpis.capital.value;
  const income = snapshot.kpis.income.value;
  const currency = snapshot.kpis.currency.value;
  const fees = snapshot.kpis.fees.value;
  const total = snapshot.kpis.totalReturn.value;
  const partsKnown = [capital, income, currency, fees, total].every((value) => value != null);
  const partSum =
    partsKnown && capital != null && income != null && currency != null && fees != null
      ? roundMoney(capital + income + currency + fees)
      : null;
  const i3ok = total != null && partSum != null && partSum === total;

  const foreignLines = snapshot.cashLines.filter((line) => line.currency !== "NZD");
  const foreignKnown = foreignLines.every((line) => line.valueNzd != null);
  const foreignNow = foreignLines.reduce((total, line) => total + (line.valueNzd || 0), 0);
  const i4ok =
    foreignKnown &&
    snapshot.kpis.cash.value != null &&
    snapshot.kpis.cash.value === roundMoney(snapshot.cashReplayNzd + foreignNow);

  const realisedParts = snapshot.groups
    .flatMap((group) => group.positions)
    .map((position) => position.realised.value)
    .filter((value): value is number => value != null);
  const realisedSum = roundMoney(realisedParts.reduce((totalValue, value) => totalValue + value, 0));
  const realisedKpi = snapshot.kpis.realised.value;
  const i5ok = realisedKpi != null && realisedKpi === realisedSum;

  const i6ok = countNewImportRows(snapshot.importKeys, snapshot.importKeys) === 0;

  const filtered = ["shares", "crypto", "metals", "cash"].map((assetClass) =>
    filterSnapshot(snapshot, { assetClass: assetClass as SnapshotClass })
  );
  const i7ok = filtered.every((view) => view.asOf === asOf) && filterSnapshot(snapshot, { open: "closed" }).asOf === asOf;

  return [
    {
      id: "I1",
      ok: i1ok,
      detail: i1ok ? "Grand total equals net worth." : "Grand total and net worth differ, or a price is missing.",
    },
    {
      id: "I2",
      ok: i2ok,
      detail: i2ok ? "Group subtotals equal the grand total." : "Group subtotals do not equal the grand total.",
    },
    {
      id: "I3",
      ok: i3ok,
      detail: i3ok ? "Capital, income, currency, and fees equal the total return." : "Return segments do not equal the total.",
    },
    {
      id: "I4",
      ok: i4ok,
      detail: i4ok ? "Cash equals the ledger replay." : "Cash does not equal the ledger replay.",
    },
    {
      id: "I5",
      ok: i5ok,
      detail: i5ok ? "Realised on each asset adds up to realised." : "Realised on each asset does not add up.",
    },
    {
      id: "I6",
      ok: i6ok,
      detail: i6ok ? "Importing these rows again adds 0." : "Importing these rows again would add rows.",
    },
    {
      id: "I7",
      ok: i7ok,
      detail: i7ok ? "Every filter uses this snapshot time." : "A filter built a different snapshot time.",
    },
  ];
}

function reconciliationOf(invariants: SnapshotInvariant[], net: number | null, grand: number | null): PortfolioSnapshot["reconciliation"] {
  const failed = invariants.filter((row) => !row.ok);
  if (net == null || grand == null) {
    return { ok: false, label: "⚠ Incomplete", outBy: null, invariants };
  }
  if (!failed.length) return { ok: true, label: "✓ Reconciled", outBy: null, invariants };
  const outBy = roundMoney(grand - net);
  const shown = outBy === 0 ? failed[0]?.detail || "Does not reconcile" : formatNzd(Math.abs(outBy));
  return {
    ok: false,
    label: outBy === 0 ? "⚠ Incomplete" : `⚠ Out by ${shown}`,
    outBy: outBy === 0 ? null : outBy,
    invariants,
  };
}

const snapshotCache = new Map<string, PortfolioSnapshot>();

export function readPortfolioSnapshotCache(userId: string | null | undefined): PortfolioSnapshot | null {
  if (!userId) return null;
  return snapshotCache.get(userId) || null;
}

export function writePortfolioSnapshotCache(userId: string | null | undefined, snapshot: PortfolioSnapshot): void {
  if (!userId) return;
  snapshotCache.set(userId, snapshot);
}

export function clearPortfolioSnapshotCache(userId?: string | null): void {
  if (!userId) {
    snapshotCache.clear();
    return;
  }
  snapshotCache.delete(userId);
}

export function buildPortfolioSnapshot(input: SnapshotInput): PortfolioSnapshot {
  const asOfIso = input.asOf && String(input.asOf).trim() ? String(input.asOf) : new Date().toISOString();
  const asOfLabel = formatDisplayDate(asOfIso);
  const source = input.priceSource || "Ledger and stored prices";
  const fxSource = input.fxSource || (input.fxSourced ? "Exchange-rate feed" : "Exchange-rate feed");
  const fxSourced = input.fxSourced === true;
  const marks = new Map<string, SnapshotMark>();
  const holdingIds = new Map<string, Set<string>>();
  function rememberHoldingId(ticker: string, id: string | null | undefined) {
    const clean = typeof id === "string" ? id.trim() : "";
    if (!ticker || !clean) return;
    const known = holdingIds.get(ticker) || new Set<string>();
    known.add(clean);
    holdingIds.set(ticker, known);
  }
  function soleHoldingId(ticker: string): string | null {
    const known = holdingIds.get(ticker);
    if (!known || known.size !== 1) return null;
    const [only] = known;
    return only || null;
  }
  for (const mark of input.marks || []) {
    const ticker = upper(mark.ticker);
    if (!ticker) continue;
    marks.set(ticker, mark);
    rememberHoldingId(ticker, mark.holdingId);
  }

  const books = new Map<string, OpenLot[]>();
  const realised: RealisedPiece[] = [];
  const income: IncomePiece[] = [];
  const wallets = new Map<string, NativeWallet>();
  const importKeys: string[] = [];
  let feeExact = 0;
  let feesIncomplete = false;
  let feeReason: string | null = null;
  const feeNotes: string[] = [];

  const chronological = orderedRows(input.rows);

  for (const row of chronological) {
    const type = String(row.type || "");
    const ticker = upper(row.ticker);
    const day = buyLotDay(row);
    if ((type === "buy" || type === "sell") && ticker && day) {
      const qty = movementQty(row);
      const price = movementPrice(row);
      if (qty > 0 && price > 0) {
        importKeys.push(
          ledgerImportKey({
            date: day,
            side: type,
            ticker,
            quantity: qty,
            price,
            brokerRef: brokerRefOf(row),
          })
        );
      }
    }
    if (row.cashNative != null && upper(row.currency) && upper(row.currency) !== "NZD") {
      const currency = upper(row.currency);
      const fx = tradeFx(currency, row.fx_rate);
      const wallet = wallets.get(currency) || { amount: 0, costNzd: 0 };
      const amount = Number(row.cashNative) || 0;
      wallet.amount += amount;
      if (fx != null) wallet.costNzd += amount * fx;
      wallets.set(currency, wallet);
    }
    if (type === "interest") {
      income.push({
        ticker: ticker || "CASH",
        assetClass: "shares",
        gross: null,
        withholding: null,
        net: signedCash(row),
        drp: 0,
        legacy: false,
      });
    }
    if (type === "fee" || type === "tax") {
      const cash = signedCash(row);
      if (cash !== 0) {
        feeExact += cash;
        feeNotes.push(`${type} ${formatNzd(cash)}`);
      }
    }
    if (type === "dividend") {
      const assetClass = ticker ? assetClassOf(row, ticker) : "shares";
      const parts = parseDividendNotes(row.notes);
      const cash = signedCash(row);
      if (!parts) {
        income.push({
          ticker: ticker || "Dividend",
          assetClass,
          gross: null,
          withholding: null,
          net: cash,
          drp: 0,
          legacy: true,
        });
      } else {
        const net = roundMoney(parts.grossNzd - parts.withholdingNzd);
        income.push({
          ticker: ticker || "Dividend",
          assetClass,
          gross: parts.grossNzd,
          withholding: parts.withholdingNzd,
          net,
          drp: parts.drpNzd,
          legacy: false,
        });
        if (parts.drpNzd > 0) {
          const drpQty = movementQty(row);
          const drpPrice = movementPrice(row);
          if (!(drpQty > 0) || !(drpPrice > 0)) {
            feeNotes.push(
              `${ticker || "Dividend"} dividend reinvestment of ${formatNzd(parts.drpNzd)} has no share quantity, so no lot was added.`
            );
          } else {
            const fx = tradeFx(parts.currency, parts.fx);
            const lots = books.get(ticker) || [];
            lots.push({
              qty: drpQty,
              price: drpPrice,
              fx,
              currency: parts.currency,
              feePerUnit: 0,
              day,
              assetClass,
              name: String(row.asset_name || ticker),
            });
            books.set(ticker, lots);
          }
        }
      }
      continue;
    }
    if (type !== "buy" && type !== "sell" && type !== "opening_balance") continue;
    if (!ticker) continue;
    const assetClass = assetClassOf(row, ticker);
    const lots = books.get(ticker) || [];
    books.set(ticker, lots);
    const qty = movementQty(row);
    const price = movementPrice(row);
    if (!(qty > 0)) continue;
    const currency = currencyOf(row, ticker, assetClass);
    const fx = tradeFx(currency, row.fx_rate);
    if (type === "sell") {
      if (!(price > 0)) {
        realised.push({
          id: String(row._id || `${ticker}-${day}-${qty}`),
          ticker,
          assetClass,
          name: String(row.asset_name || ticker),
          quantity: qty,
          price: 0,
          fx: 0,
          fees: 0,
          incomplete: true,
          reason: "The sell has no price, so realised profit is blank.",
        });
        continue;
      }
      const fee = feeNzd(row, fx);
      let left = qty;
      let pricePart = 0;
      let fxPart = 0;
      let buyFees = 0;
      let incomplete = fx == null || fee == null;
      let reason: string | null = null;
      if (fx == null) reason = "The sell has no stored exchange rate, so realised profit is blank.";
      if (fee == null) reason = "The sell fee has no exchange rate, so realised profit is blank.";
      for (const lot of lots) {
        if (left <= 1e-12) break;
        if (lot.qty <= 1e-12) continue;
        const take = Math.min(lot.qty, left);
        if (lot.fx == null) {
          incomplete = true;
          reason = "A buy lot has no stored exchange rate, so realised profit is blank.";
        } else if (fx != null) {
          pricePart += take * (price - lot.price) * fx;
          fxPart += take * lot.price * (fx - lot.fx);
          buyFees += take * lot.feePerUnit;
        }
        lot.qty -= take;
        left -= take;
      }
      if (left > 1e-6) {
        incomplete = true;
        reason = "The sell is larger than the open lots, so realised profit is blank.";
      }
      const sellFee = fee == null ? 0 : fee;
      realised.push({
        id: String(row._id || `${ticker}-${day}-${qty}`),
        ticker,
        assetClass,
        name: String(row.asset_name || ticker || ""),
        quantity: qty,
        price: pricePart,
        fx: fxPart,
        fees: -(sellFee + buyFees),
        incomplete,
        reason,
      });
      if (fee == null) {
        feesIncomplete = true;
        feeReason = reason;
      } else {
        feeExact += -sellFee;
      }
      continue;
    }
    if (!(price > 0)) continue;
    const fee = feeNzd(row, fx);
    const feePerUnit = fee != null && qty > 0 ? fee / qty : 0;
    if (fee == null) {
      feesIncomplete = true;
      feeReason = "A buy fee has no exchange rate, so fees are blank.";
    } else if (fee !== 0) {
      feeExact += -fee;
      feeNotes.push(`${ticker} buy fee ${formatNzd(-fee)}`);
    }
    lots.push({
      qty,
      price,
      fx,
      currency,
      feePerUnit,
      day,
      assetClass,
      name: String(row.asset_name || markFor(marks, ticker)?.name || ticker),
    });
  }

  for (const extra of input.extras || []) {
    const ticker = upper(extra.ticker);
    if (!ticker || !(extra.quantity > 0)) continue;
    const lots = books.get(ticker) || [];
    lots.push({
      qty: extra.quantity,
      price: extra.costPrice,
      fx: extra.currency === "NZD" ? 1 : extra.fxAtCost,
      currency: extra.currency,
      feePerUnit: 0,
      day: asOfIso.slice(0, 10),
      assetClass: extra.assetClass,
      name: extra.name || extra.ticker,
    });
    books.set(ticker, lots);
    rememberHoldingId(ticker, extra.id);
    if (extra.markPrice == null) {
      marks.set(ticker, {
        ticker,
        price: null,
        reason: extra.markReason || "No price is stored for this holding.",
        source: extra.source || null,
        asOf: extra.asOf || null,
        name: extra.name || null,
        assetType: extra.assetClass === "metals" ? "metal" : extra.assetClass === "crypto" ? "crypto" : "stock",
      });
    } else if (!marks.has(ticker)) {
      marks.set(ticker, {
        ticker,
        price: extra.markPrice,
        source: extra.source || null,
        asOf: extra.asOf || null,
        name: extra.name || null,
        currency: extra.currency,
        assetType: extra.assetClass === "metals" ? "metal" : extra.assetClass === "crypto" ? "crypto" : "stock",
      });
    }
  }

  const replayNzd = cashFromLedgerRows(
    input.rows.map((row) => ({
      type: row.type,
      total: row.total,
      cash_nzd: row.cash_nzd,
      fees_nzd: row.fees_nzd,
      quantity: row.quantity,
    }))
  );

  let contributionsExact = 0;
  for (const row of input.rows) {
    const type = String(row.type || "");
    const cash = signedCash(row);
    if (type === "deposit") contributionsExact += cash;
    if (type === "withdraw") contributionsExact += cash;
    if (type === "opening_balance" && !upper(row.ticker)) contributionsExact += cash;
    if (row.cashNative != null && upper(row.currency) !== "NZD") {
      const fx = tradeFx(upper(row.currency), row.fx_rate);
      if ((type === "deposit" || type === "withdraw") && fx != null) contributionsExact += Number(row.cashNative) * fx;
    }
  }

  const positionsByClass = new Map<Exclude<SnapshotClass, "cash">, SnapshotPosition[]>();
  let holdingsExact = 0;
  let holdingsMissing: string | null = null;
  let unrealisedFxExact = 0;
  let realisedFxExact = 0;
  let realisedPriceExact = 0;
  let unrealisedPriceExact = 0;
  let incomeExact = 0;
  let grossExact = 0;
  let withholdingExact = 0;
  let grossMissing: string | null = null;
  let currencyMissing: string | null = null;

  const incomeByTicker = new Map<string, IncomePiece[]>();
  for (const piece of income) {
    const list = incomeByTicker.get(piece.ticker) || [];
    list.push(piece);
    incomeByTicker.set(piece.ticker, list);
    incomeExact += piece.net;
    if (piece.gross == null || piece.withholding == null) {
      grossMissing = "Gross dividend was not stored on every income row.";
    } else {
      grossExact += piece.gross;
      withholdingExact += piece.withholding;
    }
  }

  const realisedByTicker = new Map<string, RealisedPiece[]>();
  for (const piece of realised) {
    const list = realisedByTicker.get(piece.ticker) || [];
    list.push(piece);
    realisedByTicker.set(piece.ticker, list);
    if (!piece.incomplete) {
      realisedPriceExact += piece.price;
      realisedFxExact += piece.fx;
    }
  }

  const seenTickers = new Set<string>();
  for (const [ticker, lots] of books) {
    seenTickers.add(ticker);
    const open = lots.filter((lot) => lot.qty > 1e-9);
    const sample = open[0] || lots[0];
    if (!sample) continue;
    const assetClass = sample.assetClass;
    const mark = markFor(marks, ticker);
    const currency = sample.currency;
    const now = rateNow(currency, input.fxNow, fxSourced);
    const priceNow = mark && mark.price != null && mark.price > 0 ? mark.price : null;
    const priceReason =
      priceNow == null ? mark?.reason || "No price is stored for this holding." : null;
    const fxReason =
      currency !== "NZD" && now == null
        ? "The exchange-rate feed did not return a rate, so this NZ$ value is blank."
        : null;
    const qty = open.reduce((total, lot) => total + lot.qty, 0);
    const openCostNative = open.reduce((total, lot) => total + lot.qty * lot.price, 0);
    const avg = qty > 0 ? openCostNative / qty : null;
    let costExact = 0;
    let costMissing: string | null = null;
    let uFx = 0;
    let uPrice = 0;
    let openFee = 0;
    const lotViews: SnapshotLot[] = open.map((lot) => {
      const fee = lot.qty * lot.feePerUnit;
      openFee += fee;
      const cost = lot.fx == null ? null : fifoLotCostNzd(lot.qty, lot.price, lot.fx);
      if (cost == null) costMissing = "A lot has no stored exchange rate, so cost base is blank.";
      else costExact += cost;
      if (lot.fx != null && now != null && priceNow != null) {
        uPrice += lot.qty * (priceNow - lot.price) * now;
        uFx += lot.qty * lot.price * (now - lot.fx);
      }
      return {
        acquired: lot.day,
        acquiredLabel: formatDisplayDate(lot.day),
        quantity: lot.qty,
        priceLocal: lot.price,
        fx: lot.fx,
        fxDisplay: fxDisplay(lot.fx),
        costNzd: cost == null ? null : cost,
        feeNzd: fee,
      };
    });
    const mvExact = priceNow != null && now != null && qty > 0 ? qty * priceNow * now : qty > 0 ? null : 0;
    if (mvExact == null && qty > 0) {
      holdingsMissing = priceReason || fxReason || "A holding has no price.";
    } else if (mvExact != null) {
      holdingsExact += mvExact;
    }
    if (qty > 0 && (priceNow == null || now == null || costMissing)) {
      if (now == null && currency !== "NZD") currencyMissing = fxReason;
    } else if (qty > 0) {
      unrealisedFxExact += uFx;
      unrealisedPriceExact += uPrice;
    }
    const tickerRealised = realisedByTicker.get(ticker) || [];
    const tickerIncome = incomeByTicker.get(ticker) || [];
    const rPrice = tickerRealised.reduce((total, piece) => total + (piece.incomplete ? 0 : piece.price), 0);
    const rFx = tickerRealised.reduce((total, piece) => total + (piece.incomplete ? 0 : piece.fx), 0);
    const rFees = tickerRealised.reduce((total, piece) => total + (piece.incomplete ? 0 : piece.fees), 0);
    const realisedIncomplete = tickerRealised.some((piece) => piece.incomplete);
    const realisedParts = realisedDisplays(rPrice, rFx, rFees, realisedIncomplete);
    const incomeNet = tickerIncome.reduce((total, piece) => total + piece.net, 0);
    const positionFees = -openFee + rFees;
    const list = positionsByClass.get(assetClass) || [];
    const positionName = sample.name || mark?.name || ticker;
    const mvFigure =
      mvExact == null
        ? emptyFigure("Market value is quantity × price × the NZD rate now.", priceReason || fxReason || "Price missing.", mark?.source || source, mark?.asOf ? formatDisplayDate(mark.asOf) : asOfLabel)
        : figureFrom(
            mvExact,
            "Market value is the open quantity times the price now times the NZD rate now.",
            [`Quantity ${qty}`, `Price ${priceNow}`, `NZD rate ${fxDisplay(now)}`],
            `${qty} × ${priceNow} × ${fxDisplay(now)}`,
            mark?.source || source,
            mark?.asOf ? formatDisplayDate(mark.asOf) : asOfLabel
          );
    const costFigure =
      qty <= 0
        ? figureFrom(0, "A closed position has no remaining cost.", [], "0", source, asOfLabel)
        : costMissing
          ? emptyFigure("Cost base is each open lot's quantity × fill × the buy rate.", costMissing, source, asOfLabel)
          : figureFrom(
              costExact,
              "Cost base is each open lot's quantity times its fill times the exchange rate on the buy.",
              lotViews.map((lot) => `${lot.acquiredLabel}: ${lot.quantity} × ${lot.priceLocal} × ${lot.fxDisplay}`),
              formatNzd(costExact),
              "Ledger",
              asOfLabel
            );
    const uValue = mvExact != null && !costMissing && now != null && priceNow != null ? mvExact - costExact : qty > 0 ? null : 0;
    list.push({
      ticker,
      name: positionName,
      assetClass,
      quantity: qty,
      closed: qty <= 1e-9,
      averageCostLocal: avg,
      marketPriceLocal: priceNow,
      currency,
      fxNow: now,
      fxNowDisplay: fxDisplay(now),
      marketValue: mvFigure,
      costBase: costFigure,
      unrealised:
        uValue == null
          ? emptyFigure("Unrealised is market value minus cost base.", holdingsMissing || "Price or rate missing.", source, asOfLabel)
          : figureFrom(uValue, "Unrealised is market value minus cost base.", [], `${mvFigure.display} − ${costFigure.display}`, source, asOfLabel),
      unrealisedPrice:
        qty > 0 && (priceNow == null || now == null)
          ? emptyFigure("The price part is quantity × (price now − buy price) × the NZD rate now.", priceReason || fxReason || "Price missing.", source, asOfLabel)
          : figureFrom(qty > 0 ? uPrice : 0, "The price part is the quantity times (price now minus the buy price) times the NZD rate now.", [], formatNzd(uPrice), source, asOfLabel),
      unrealisedFx:
        qty > 0 && (now == null || costMissing != null)
          ? emptyFigure("The exchange-rate part is quantity × buy price × (rate now − buy rate).", fxReason || costMissing || "Rate missing.", fxSource, input.fxAsOf ? formatDisplayDate(input.fxAsOf) : asOfLabel)
          : figureFrom(qty > 0 ? uFx : 0, "The exchange-rate part is the quantity times the buy price times (the rate now minus the buy rate).", [], formatNzd(uFx), fxSource, input.fxAsOf ? formatDisplayDate(input.fxAsOf) : asOfLabel),
      realised: realisedIncomplete
        ? emptyFigure("Realised profit closes the oldest lots first.", tickerRealised.find((piece) => piece.reason)?.reason || "Realised is blank.", "Ledger", asOfLabel)
        : figureFrom(realisedParts.total, "Realised profit is the price part plus the exchange-rate part, minus fees. The price part is the remainder so those parts add up.", [], formatNzd(realisedParts.total || 0), "Ledger", asOfLabel),
      realisedPrice: figureFrom(realisedParts.price, "The price part is what is left so it plus the exchange-rate part plus fees equals realised profit.", [], formatNzd(realisedParts.price || 0), "Ledger", asOfLabel),
      realisedFx: figureFrom(
        realisedParts.fx,
        "Realised exchange-rate profit is the closed quantity times the buy price times (the sell rate minus the buy rate).",
        [],
        formatNzd(realisedParts.fx || 0),
        "Ledger",
        asOfLabel
      ),
      income: figureFrom(incomeNet, "Income is dividend gross minus withholding. Interest on the ledger is included.", [], formatNzd(incomeNet), "Ledger", asOfLabel),
      incomeGross: figureFrom(
        tickerIncome.some((piece) => piece.gross == null) ? null : tickerIncome.reduce((total, piece) => total + (piece.gross || 0), 0),
        "Gross dividend in NZ$, converted at the payment-date rate.",
        [],
        "",
        "Ledger",
        asOfLabel,
        tickerIncome.some((piece) => piece.legacy) ? "Gross dividend was not stored." : null
      ),
      incomeWithholding: figureFrom(
        tickerIncome.some((piece) => piece.withholding == null) ? null : tickerIncome.reduce((total, piece) => total + (piece.withholding || 0), 0),
        "Withholding in NZ$, converted at the payment-date rate.",
        [],
        "",
        "Ledger",
        asOfLabel,
        tickerIncome.some((piece) => piece.legacy) ? "Withholding was not stored." : null
      ),
      currencyEffect: figureFrom(realisedIncomplete ? null : uFx + rFx, "Currency is the open exchange-rate part plus the realised exchange-rate part.", [], "", fxSource, asOfLabel),
      fees: figureFrom(positionFees, "Fees are buy and sell fees in NZ$, shown as a reduction.", feeNotes, formatNzd(positionFees), "Ledger", asOfLabel),
      totalReturn: figureFrom(null, "Filled after the book total is known.", [], "", source, asOfLabel),
      weight: figureFrom(null, "Weight is this market value divided by net worth.", [], "", source, asOfLabel),
      lots: lotViews,
      priceSource: mark?.source || null,
      priceAsOf: mark?.asOf ? formatDisplayDate(mark.asOf) : null,
      holdingId: soleHoldingId(ticker),
    });
    positionsByClass.set(assetClass, list);
  }

  for (const [ticker, pieces] of realisedByTicker) {
    if (seenTickers.has(ticker)) continue;
    const sample = pieces[0];
    if (!sample) continue;
    const rPrice = pieces.reduce((total, piece) => total + (piece.incomplete ? 0 : piece.price), 0);
    const rFx = pieces.reduce((total, piece) => total + (piece.incomplete ? 0 : piece.fx), 0);
    const rFees = pieces.reduce((total, piece) => total + (piece.incomplete ? 0 : piece.fees), 0);
    const incomplete = pieces.some((piece) => piece.incomplete);
    const realisedParts = realisedDisplays(rPrice, rFx, rFees, incomplete);
    const list = positionsByClass.get(sample.assetClass) || [];
    list.push({
      ticker,
      name: sample.name || ticker,
      assetClass: sample.assetClass,
      quantity: 0,
      closed: true,
      averageCostLocal: null,
      marketPriceLocal: null,
      currency: "USD",
      fxNow: null,
      fxNowDisplay: MISSING_MARK,
      marketValue: figureFrom(0, "A closed position has no market value.", [], "0", source, asOfLabel),
      costBase: figureFrom(0, "A closed position has no remaining cost.", [], "0", source, asOfLabel),
      unrealised: figureFrom(0, "A closed position has no unrealised profit.", [], "0", source, asOfLabel),
      unrealisedPrice: figureFrom(0, "A closed position has no open price move.", [], "0", source, asOfLabel),
      unrealisedFx: figureFrom(0, "A closed position has no open exchange-rate move.", [], "0", source, asOfLabel),
      realised: incomplete
        ? emptyFigure("Realised profit closes the oldest lots first.", pieces.find((piece) => piece.reason)?.reason || "Realised is blank.", "Ledger", asOfLabel)
        : figureFrom(realisedParts.total, "Realised profit is the price part plus the exchange-rate part, minus fees. The price part is the remainder so the parts add up.", [], formatNzd(realisedParts.total || 0), "Ledger", asOfLabel),
      realisedPrice: figureFrom(realisedParts.price, "The price part is what is left so it plus the exchange-rate part plus fees equals realised profit.", [], formatNzd(realisedParts.price || 0), "Ledger", asOfLabel),
      realisedFx: figureFrom(realisedParts.fx, "Realised exchange-rate profit is the closed quantity times the buy price times (the sell rate minus the buy rate).", [], formatNzd(realisedParts.fx || 0), "Ledger", asOfLabel),
      income: figureFrom(0, "No dividend is stored on this closed position.", [], formatNzd(0), "Ledger", asOfLabel),
      incomeGross: figureFrom(0, "No gross dividend is stored on this closed position.", [], formatNzd(0), "Ledger", asOfLabel),
      incomeWithholding: figureFrom(0, "No withholding is stored on this closed position.", [], formatNzd(0), "Ledger", asOfLabel),
      currencyEffect: figureFrom(incomplete ? null : rFx, "Currency on a closed position is the realised exchange-rate part.", [], formatNzd(rFx), "Ledger", asOfLabel),
      fees: figureFrom(rFees, "Fees on the closing sell, shown as a reduction.", [], formatNzd(rFees), "Ledger", asOfLabel),
      totalReturn: figureFrom(null, "Filled after the book total is known.", [], "", source, asOfLabel),
      weight: figureFrom(0, "A closed position has no weight.", [], "0", source, asOfLabel),
      lots: [],
      priceSource: null,
      priceAsOf: null,
      holdingId: soleHoldingId(ticker),
    });
    positionsByClass.set(sample.assetClass, list);
  }

  let foreignValue = 0;
  let foreignFx = 0;
  let foreignMissing: string | null = null;
  const cashLines: SnapshotCashLine[] = [];
  const nzdNegative = replayNzd < -0.001;
  cashLines.push({
    currency: "NZD",
    amountLocal: replayNzd,
    fx: 1,
    fxDisplay: fxDisplay(1),
    valueNzd: replayNzd,
    fxGainNzd: 0,
    negative: nzdNegative,
  });
  for (const [currency, wallet] of wallets) {
    if (Math.abs(wallet.amount) <= 1e-9) continue;
    const now = rateNow(currency, input.fxNow, fxSourced);
    const avg = wallet.amount !== 0 && wallet.costNzd !== 0 ? wallet.costNzd / wallet.amount : null;
    if (now == null || avg == null) {
      foreignMissing = "Foreign cash has no exchange rate, so its NZ$ value is blank.";
      cashLines.push({
        currency,
        amountLocal: wallet.amount,
        fx: now,
        fxDisplay: fxDisplay(now),
        valueNzd: null,
        fxGainNzd: null,
        negative: wallet.amount < -0.001,
      });
      continue;
    }
    foreignValue += wallet.amount * now;
    foreignFx += wallet.amount * (now - avg);
    cashLines.push({
      currency,
      amountLocal: wallet.amount,
      fx: now,
      fxDisplay: fxDisplay(now),
      valueNzd: wallet.amount * now,
      fxGainNzd: wallet.amount * (now - avg),
      negative: wallet.amount < -0.001,
    });
  }

  const cashExact = foreignMissing ? null : replayNzd + foreignValue;
  const currencyExact = currencyMissing || foreignMissing ? null : unrealisedFxExact + realisedFxExact + foreignFx;
  const capitalExact = holdingsMissing || currencyMissing ? null : unrealisedPriceExact + realisedPriceExact;
  const feesValue = feesIncomplete ? null : feeExact;
  const incomeValue = incomeExact;
  const totalExact =
    capitalExact == null || currencyExact == null || feesValue == null
      ? null
      : capitalExact + incomeValue + currencyExact + feesValue;

  const holdingsValue = holdingsMissing ? null : roundMoney(holdingsExact);
  const cashValue = cashExact == null ? null : roundMoney(cashExact);
  const netWorth = holdingsValue == null || cashValue == null ? null : roundMoney(holdingsValue + cashValue);

  const displayIncome = roundMoney(incomeValue);
  const displayCurrency = currencyExact == null ? null : roundMoney(currencyExact);
  const displayFees = feesValue == null ? null : roundMoney(feesValue);
  const displayTotal =
    totalExact == null || displayCurrency == null || displayFees == null ? null : roundMoney(totalExact);
  const displayCapital =
    displayTotal == null || displayCurrency == null || displayFees == null
      ? null
      : roundMoney(displayTotal - displayIncome - displayCurrency - displayFees);

  const displayRealised = roundMoney(
    realised.filter((piece) => !piece.incomplete).reduce((total, piece) => total + piece.price + piece.fx + piece.fees, 0)
  );

  const classExact = new Map<SnapshotClass, number>();
  for (const id of CLASS_ORDER) classExact.set(id, 0);
  if (holdingsMissing) {
    for (const id of ["shares", "crypto", "metals"] as const) classExact.set(id, Number.NaN);
  } else {
    for (const [assetClass, positions] of positionsByClass) {
      let sum = 0;
      for (const position of positions) {
        if (position.quantity <= 1e-9) continue;
        const raw = position.marketValue.value;
        if (raw == null) {
          sum = Number.NaN;
          break;
        }
        sum += raw;
      }
      classExact.set(assetClass, Number.isFinite(sum) ? sum : Number.NaN);
    }
  }
  if (cashValue == null) classExact.set("cash", Number.NaN);
  else classExact.set("cash", cashValue);

  const classTargets = CLASS_ORDER.map((id) => {
    const value = classExact.get(id);
    return value == null || !Number.isFinite(value) ? null : value;
  });
  const classKnown = classTargets.every((value) => value != null);
  const classDisplays =
    classKnown && holdingsValue != null && cashValue != null
      ? distribute(
          classTargets.slice(0, 3).map((value) => value || 0),
          holdingsValue
        ).concat([cashValue])
      : classTargets.map((value, index) => (index === 3 ? cashValue : holdingsMissing ? null : value));

  const groups: SnapshotGroup[] = CLASS_ORDER.map((id, index) => {
    const positions = id === "cash" ? [] : positionsByClass.get(id) || [];
    const value = classDisplays[index];
    const label = CLASS_LABEL[id];
    return {
      id,
      label,
      marketValue:
        value == null
          ? emptyFigure(`${label} market value.`, holdingsMissing || foreignMissing || "A price is missing.", source, asOfLabel)
          : figureFrom(value, `${label} is the sum of market values in this group.`, positions.map((position) => `${position.ticker} ${position.marketValue.display}`), formatNzd(value), source, asOfLabel),
      positions,
    };
  });

  const grandValue = netWorth;
  const mathsSource = source;
  const kpis: PortfolioSnapshot["kpis"] = {
    netWorth:
      netWorth == null
        ? emptyFigure("Net worth is the sum of market values plus cash in NZ$.", holdingsMissing || foreignMissing || "A price is missing.", mathsSource, asOfLabel)
        : figureFrom(netWorth, "Net worth is holdings at market value plus cash, both in NZ$.", [`Holdings ${formatNzd(holdingsValue || 0)}`, `Cash ${formatNzd(cashValue || 0)}`], `${formatNzd(holdingsValue || 0)} + ${formatNzd(cashValue || 0)}`, mathsSource, asOfLabel),
    holdingsValue:
      holdingsValue == null
        ? emptyFigure("Holdings value is the sum of open market values.", holdingsMissing || "A price is missing.", mathsSource, asOfLabel)
        : figureFrom(holdingsValue, "Holdings value adds each open quantity × price × NZD rate, then rounds once.", [], formatNzd(holdingsValue), mathsSource, asOfLabel),
    cash:
      cashValue == null
        ? emptyFigure("Cash replays the ledger, then values foreign cash at the rate now.", foreignMissing || "Cash is blank.", "Ledger", asOfLabel)
        : figureFrom(
            cashValue,
            "Cash is deposits minus withdrawals minus buys plus sells plus net dividends plus interest, from the ledger. Foreign cash is valued at the rate now.",
            [`Ledger replay ${formatNzd(replayNzd)}`],
            formatNzd(cashValue),
            "Ledger",
            asOfLabel
          ),
    contributions: figureFrom(
      contributionsExact,
      "Net contributions are deposits minus withdrawals. Buys are not contributions.",
      [],
      formatNzd(contributionsExact),
      "Ledger",
      asOfLabel
    ),
    today:
      input.previousNetWorth == null || netWorth == null
        ? emptyFigure("Today's change is net worth now minus net worth at the previous close.", "No previous close was stored for this book.", mathsSource, asOfLabel)
        : figureFrom(netWorth - input.previousNetWorth, "Today's change is net worth now minus the stored previous close.", [`Previous ${formatNzd(input.previousNetWorth)}`], formatNzd(netWorth - input.previousNetWorth), mathsSource, asOfLabel),
    totalReturn:
      displayTotal == null
        ? emptyFigure("Total return is capital plus income plus currency, minus fees.", "A price or exchange rate is missing.", mathsSource, asOfLabel)
        : figureFrom(displayTotal, "Total return is capital plus income plus the currency effect, minus fees. The parts add to this figure.", [], formatNzd(displayTotal), mathsSource, asOfLabel),
    capital:
      displayCapital == null
        ? emptyFigure("Capital is the price change on open lots and on lots already sold.", "A price or exchange rate is missing.", mathsSource, asOfLabel)
        : figureFrom(
            displayCapital,
            "Capital is the price change on open lots, at the rate now, plus the price part of realised sales. Buy fees are in fees, not here.",
            [
              "Each holding's gain on the stocks card is rounded to cents on its own line. This capital figure is rounded once for the whole book, so the two can differ by a few cents.",
              "The stocks profit and loss card is shares only. This capital figure is the whole book, including crypto and metals.",
            ],
            formatNzd(displayCapital),
            mathsSource,
            asOfLabel
          ),
    income: figureFrom(
      displayIncome,
      "Income is dividend gross minus withholding, in NZ$ at the payment-date rate. Interest recorded on the ledger is included. The total uses this net figure.",
      income.map((piece) => `${piece.ticker}: net ${formatNzd(piece.net)}`),
      formatNzd(displayIncome),
      "Ledger",
      asOfLabel
    ),
    incomeGross:
      grossMissing && grossExact === 0
        ? emptyFigure("Gross dividend in NZ$ at the payment-date rate.", grossMissing, "Ledger", asOfLabel)
        : figureFrom(grossExact, "Gross dividend in NZ$, converted at the payment-date rate.", [], formatNzd(grossExact), "Ledger", asOfLabel, grossMissing),
    incomeWithholding:
      grossMissing && withholdingExact === 0
        ? emptyFigure("Withholding in NZ$ at the payment-date rate.", "Withholding was not stored.", "Ledger", asOfLabel)
        : figureFrom(withholdingExact, "Withholding in NZ$, converted at the payment-date rate.", [], formatNzd(withholdingExact), "Ledger", asOfLabel, grossMissing),
    currency:
      displayCurrency == null
        ? emptyFigure("Currency is the exchange-rate move on open lots, on sales, and on foreign cash.", currencyMissing || foreignMissing || "An exchange rate is missing.", fxSource, asOfLabel)
        : figureFrom(
            displayCurrency,
            "Currency is the open quantity times the buy price times (the rate now minus the buy rate), plus the same difference on lots already sold, plus foreign cash times (the rate now minus the rate it was booked at).",
            [`Open ${formatNzd(unrealisedFxExact)}`, `Realised ${formatNzd(realisedFxExact)}`, `Foreign cash ${formatNzd(foreignFx)}`],
            `${formatNzd(unrealisedFxExact)} + ${formatNzd(realisedFxExact)} + ${formatNzd(foreignFx)}`,
            fxSource,
            input.fxAsOf ? formatDisplayDate(input.fxAsOf) : asOfLabel
          ),
    fees:
      displayFees == null
        ? emptyFigure("Fees are trade and ledger fees in NZ$, shown as a reduction.", feeReason || "A fee has no exchange rate.", "Ledger", asOfLabel)
        : figureFrom(displayFees, "Fees are buy fees, sell fees, and fee lines on the ledger, in NZ$, shown as a reduction.", feeNotes, formatNzd(displayFees), "Ledger", asOfLabel),
    realised: figureFrom(
      displayRealised,
      "Realised profit closes the oldest lots first. Each sale is the price part plus the exchange-rate part, minus fees.",
      [],
      formatNzd(displayRealised),
      "Ledger",
      asOfLabel
    ),
    simplePct: percentFigure(null, "Filled below.", blankMaths("Simple return is total return divided by net contributions.", "", mathsSource, asOfLabel)),
    annualisedPct: percentFigure(null, "Filled below.", blankMaths("Per year is the money-weighted return.", "", mathsSource, asOfLabel)),
    benchmark: percentFigure(
      null,
      input.benchmark?.reason || "No benchmark series was stored for this snapshot.",
      blankMaths("The benchmark gap is the portfolio percent minus the benchmark percent.", input.benchmark?.reason || "No benchmark series was stored.", input.benchmark?.name || "Benchmark", asOfLabel)
    ),
  };

  const contributions = roundMoney(contributionsExact);
  if (displayTotal == null) {
    kpis.simplePct = percentFigure(null, "Total return is blank, so the percentage is blank.", kpis.simplePct.maths);
  } else if (contributions === 0) {
    kpis.simplePct = percentFigure(null, "Net contributions are zero, so a percentage is not defined.", {
      formula: "Simple return is total return divided by net contributions.",
      inputs: [`Total return ${kpis.totalReturn.display}`, "Net contributions NZ$0.00"],
      arithmetic: MISSING_MARK,
      source: mathsSource,
      asOf: asOfLabel,
    });
  } else if (input.period?.start) {
    kpis.simplePct = percentFigure(null, "The market value at the start of this period was not stored.", {
      formula: "A period percent needs the market value at the start, minus flows.",
      inputs: [`Period from ${formatDisplayDate(input.period.start)}`],
      arithmetic: MISSING_MARK,
      source: mathsSource,
      asOf: asOfLabel,
    });
  } else {
    kpis.simplePct = percentFigure(displayTotal / contributions, null, {
      formula: "Simple return is total return divided by net contributions. It is not a per-year figure.",
      inputs: [`Total return ${formatNzd(displayTotal)}`, `Net contributions ${formatNzd(contributions)}`],
      arithmetic: `${formatNzd(displayTotal)} / ${formatNzd(contributions)}`,
      source: mathsSource,
      asOf: asOfLabel,
    });
  }

  const firstDay = chronological.map((row) => buyLotDay(row)).find((day) => day) || asOfIso.slice(0, 10);
  const span = daysBetween(firstDay, asOfIso.slice(0, 10));
  if (span != null && span < XIRR_ANNUALISE_AFTER_DAYS) {
    kpis.annualisedPct = percentFigure(null, "Per year is shown only when the period is 90 days or longer.", {
      formula: "The money-weighted per-year return needs a period of at least 90 days.",
      inputs: [`Days ${span}`],
      arithmetic: MISSING_MARK,
      source: mathsSource,
      asOf: asOfLabel,
    });
  } else if (netWorth == null) {
    kpis.annualisedPct = percentFigure(null, "Net worth is blank, so the per-year return is blank.", kpis.annualisedPct.maths);
  } else {
    const flows: SolverFlow[] = [];
    for (const row of chronological) {
      const type = String(row.type || "");
      if (type !== "deposit" && type !== "withdraw" && type !== "opening_balance") continue;
      if (type === "opening_balance" && upper(row.ticker)) continue;
      const day = buyLotDay(row);
      const cash = signedCash(row);
      if (!day || cash === 0) continue;
      flows.push({ date: day, amountNzd: roundMoney(-cash) });
    }
    flows.push({ date: asOfIso.slice(0, 10), amountNzd: netWorth });
    const solved = solveXirr(flows);
    kpis.annualisedPct =
      solved == null
        ? percentFigure(null, "The money-weighted return did not settle.", {
            formula: "Per year is the money-weighted return on deposits, withdrawals, and net worth.",
            inputs: flows.map((flow) => `${formatDisplayDate(flow.date)} ${formatNzd(flow.amountNzd)}`),
            arithmetic: MISSING_MARK,
            source: mathsSource,
            asOf: asOfLabel,
          })
        : percentFigure(solved, null, {
            formula: "Per year is the money-weighted return. Deposits go in, and today's net worth is treated as the closing value.",
            inputs: flows.map((flow) => `${formatDisplayDate(flow.date)} ${formatNzd(flow.amountNzd)}`),
            arithmetic: `${(solved * 100).toFixed(2)}%`,
            source: mathsSource,
            asOf: asOfLabel,
          });
  }

  if (input.benchmark && input.benchmark.portfolioPct != null && input.benchmark.benchmarkPct != null) {
    const gap = input.benchmark.portfolioPct - input.benchmark.benchmarkPct;
    kpis.benchmark = percentFigure(gap / 100, null, {
      formula: "The gap is the portfolio percent minus the benchmark percent over the same period.",
      inputs: [`Portfolio ${(input.benchmark.portfolioPct).toFixed(2)}%`, `${input.benchmark.name} ${input.benchmark.benchmarkPct.toFixed(2)}%`],
      arithmetic: `${input.benchmark.portfolioPct.toFixed(2)} − ${input.benchmark.benchmarkPct.toFixed(2)}`,
      source: input.benchmark.name,
      asOf: asOfLabel,
    });
  }

  for (const group of groups) {
    if (group.id === "cash" || group.marketValue.value == null) continue;
    const open = group.positions.filter((position) => position.quantity > 1e-9);
    if (!open.length || open.some((position) => position.marketValue.value == null)) continue;
    const balanced = distribute(
      open.map((position) => position.marketValue.value as number),
      group.marketValue.value
    );
    open.forEach((position, index) => {
      const value = balanced[index];
      if (value === position.marketValue.value) return;
      position.marketValue = {
        ...position.marketValue,
        value,
        display: formatNzd(value),
      };
    });
  }

  for (const group of groups) {
    for (const position of group.positions) {
      const inc = position.income.value || 0;
      const fx = (position.unrealisedFx.value || 0) + (position.realisedFx.value || 0);
      const fees = position.fees.value || 0;
      const tr = roundMoney((position.unrealisedPrice.value || 0) + (position.realisedPrice.value || 0) + inc + fx + fees);
      position.totalReturn = figureFrom(
        position.marketValue.value == null && !position.closed ? null : tr,
        "Total return on this row is the price parts plus income plus the currency parts, minus fees.",
        [],
        formatNzd(tr),
        mathsSource,
        asOfLabel,
        position.marketValue.value == null && !position.closed ? position.marketValue.reason : null
      );
      if (netWorth != null && netWorth !== 0 && position.marketValue.value != null) {
        const weight = position.marketValue.value / netWorth;
        position.weight = percentFigure(weight, null, {
          formula: "Weight is this market value divided by net worth.",
          inputs: [`Market value ${position.marketValue.display}`, `Net worth ${formatNzd(netWorth)}`],
          arithmetic: `${position.marketValue.display} / ${formatNzd(netWorth)}`,
          source: mathsSource,
          asOf: asOfLabel,
        });
      } else if (position.closed) {
        position.weight = percentFigure(0, null, position.weight.maths);
      }
    }
  }

  const realisedById = new Map(realised.map((piece) => [piece.id, piece]));
  const ledger: SnapshotLedgerLine[] = [...input.rows]
    .map((row, index) => {
      const type = String(row.type || "");
      const ticker = upper(row.ticker);
      const day = buyLotDay(row);
      const currency = currencyOf(row, ticker, assetClassOf(row, ticker));
      const fx = tradeFx(currency, row.fx_rate);
      const realisedRow = type === "sell" ? realisedById.get(String(row._id || `${ticker}-${day}-${movementQty(row)}`)) : undefined;
      return {
        id: String(row._id || `${type}-${index}`),
        type,
        ticker,
        quantity: movementQty(row) || null,
        price: movementPrice(row) || null,
        feesNzd: feeNzd(row, fx),
        currency,
        fx,
        fxDisplay: fxDisplay(fx),
        cashNzd: signedCash(row),
        realisedNzd:
          type === "sell"
            ? realisedRow && !realisedRow.incomplete
              ? realisedDisplays(realisedRow.price, realisedRow.fx, realisedRow.fees, false).total
              : null
            : null,
        when: day,
        whenLabel: day ? formatDisplayDate(day) : MISSING_MARK,
        sort: day,
      };
    })
    .sort((a, b) => b.sort.localeCompare(a.sort) || b.id.localeCompare(a.id))
    .map(({ sort: _sort, ...line }) => line);

  const cashWarning = cashLines.some((line) => line.negative)
    ? "Cash is below zero. It is shown as it is, not raised to zero."
    : feeNotes.find((note) => note.includes("no lot was added")) || null;

  const built: PortfolioSnapshot = {
    asOf: asOfIso,
    asOfLabel,
    source,
    kpis,
    groups,
    grand:
      grandValue == null
        ? emptyFigure("The grand total is net worth.", holdingsMissing || "A price is missing.", mathsSource, asOfLabel)
        : figureFrom(grandValue, "The grand total is the same net worth as the header, to the cent.", groups.map((group) => `${group.label} ${group.marketValue.display}`), formatNzd(grandValue), mathsSource, asOfLabel),
    cashLines,
    cashReplayNzd: replayNzd,
    cashWarning,
    ledger,
    importKeys,
    filteredNote: null,
    reconciliation: { ok: false, label: "⚠ Incomplete", outBy: null, invariants: [] },
  };

  const invariants = checkInvariants(built);
  built.reconciliation = reconciliationOf(invariants, built.kpis.netWorth.value, built.grand.value);

  if (input.filter && (input.filter.assetClass || input.filter.open)) {
    return filterSnapshot(built, input.filter);
  }
  return built;
}

export interface ConfirmedFill {
  type?: string | null;
  ticker?: string | null;
  asset_type?: string | null;
  asset_name?: string | null;
  quantity?: number | null;
  price?: number | null;
  fill_price?: number | null;
  fx_rate?: number | null;
  currency?: string | null;
}

function classOfTrade(assetType: string | null | undefined): Exclude<SnapshotClass, "cash"> {
  const kind = String(assetType || "").toLowerCase();
  if (kind === "crypto") return "crypto";
  if (kind === "metal" || kind === "metals") return "metals";
  return "shares";
}

function groupLabel(id: Exclude<SnapshotClass, "cash">): string {
  if (id === "crypto") return "Crypto";
  if (id === "metals") return "Metals";
  return "Shares";
}

function repaintFigure(figure: SnapshotFigure, value: number | null, reason: string | null): SnapshotFigure {
  if (value == null) return { ...figure, value: null, display: MISSING_MARK, reason };
  const rounded = roundMoney(value);
  return { ...figure, value: rounded, display: formatNzd(rounded), reason: null };
}

/**
 * Cash, quantity and net worth from the confirm response, in one snapshot.
 * Cost base uses the same fill × quantity × rate as the FIFO paper.
 */
export function paintConfirmedSnapshot(
  snapshot: PortfolioSnapshot,
  trade: ConfirmedFill,
  cashBalance: number
): PortfolioSnapshot {
  const next = structuredClone(snapshot);
  const type = String(trade.type || "").toLowerCase();
  const ticker = String(trade.ticker || "").trim().toUpperCase();
  const qty = Number(trade.quantity);
  const fill = Number(trade.fill_price) > 0 ? Number(trade.fill_price) : Number(trade.price);
  const currency = String(trade.currency || "").toUpperCase();
  const fx = currency ? tradeFx(currency, trade.fx_rate) : null;
  const tradable = (type === "buy" || type === "sell") && !!ticker && qty > 0;

  if (tradable) {
    const assetClass = classOfTrade(trade.asset_type);
    let group = next.groups.find((item) => item.id === assetClass);
    if (!group) {
      group = {
        id: assetClass,
        label: groupLabel(assetClass),
        marketValue: emptyFigure("Market value is the sum of open positions.", "No positions yet.", next.source, next.asOfLabel),
        positions: [],
      };
      next.groups.push(group);
    }
    let position = group.positions.find((item) => item.ticker.toUpperCase() === ticker && !item.closed);
    if (!position && type === "buy") {
      const blank = emptyFigure("Filled from the confirmed trade.", "Not stored yet.", "Ledger", next.asOfLabel);
      position = {
        ticker,
        name: trade.asset_name || ticker,
        assetClass,
        quantity: 0,
        closed: false,
        averageCostLocal: null,
        marketPriceLocal: null,
        currency: currency || "NZD",
        fxNow: fx,
        fxNowDisplay: fxDisplay(fx),
        marketValue: blank,
        costBase: blank,
        unrealised: blank,
        unrealisedPrice: blank,
        unrealisedFx: blank,
        realised: blank,
        realisedPrice: blank,
        realisedFx: blank,
        income: blank,
        incomeGross: blank,
        incomeWithholding: blank,
        currencyEffect: blank,
        fees: blank,
        totalReturn: blank,
        weight: blank,
        lots: [],
        priceSource: null,
        priceAsOf: null,
        holdingId: null,
      };
      group.positions.push(position);
    }
    if (position) {
      const oldQty = position.quantity;
      const unit =
        oldQty > 1e-9 && position.marketValue.value != null
          ? position.marketValue.value / oldQty
          : fill > 0 && (fx != null || currency === "NZD")
            ? fill * (fx ?? 1)
            : null;
      if (type === "buy" && fill > 0) {
        const lotFx = fx ?? (currency === "NZD" || !currency ? 1 : null);
        position.lots.push({
          acquired: next.asOf.slice(0, 10),
          acquiredLabel: next.asOfLabel,
          quantity: qty,
          priceLocal: fill,
          fx: lotFx,
          fxDisplay: fxDisplay(lotFx),
          costNzd: lotFx != null ? fifoLotCostNzd(qty, fill, lotFx) : null,
          feeNzd: 0,
        });
        position.quantity = oldQty + qty;
      } else if (type === "sell") {
        let left = qty;
        const kept: SnapshotLot[] = [];
        for (const lot of position.lots) {
          if (left <= 1e-9) {
            kept.push(lot);
            continue;
          }
          if (lot.quantity <= left + 1e-9) {
            left -= lot.quantity;
            continue;
          }
          const remain = lot.quantity - left;
          const ratio = lot.quantity > 0 ? remain / lot.quantity : 0;
          kept.push({
            ...lot,
            quantity: remain,
            costNzd: lot.costNzd == null ? null : lot.costNzd * ratio,
            feeNzd: lot.feeNzd * ratio,
          });
          left = 0;
        }
        position.lots = kept;
        position.quantity = Math.max(0, oldQty - qty);
        if (position.lots.length === 0 && position.quantity > 1e-9 && position.costBase.value != null && oldQty > 0) {
          position.costBase = repaintFigure(position.costBase, position.costBase.value * (position.quantity / oldQty), null);
        }
      }
      position.closed = position.quantity <= 1e-9;
      const openLots = position.lots.filter((lot) => lot.quantity > 1e-9);
      if (openLots.length) {
        const lotQty = openLots.reduce((sum, lot) => sum + lot.quantity, 0);
        const native = openLots.reduce((sum, lot) => sum + lot.quantity * lot.priceLocal, 0);
        position.averageCostLocal = lotQty > 0 ? native / lotQty : null;
        const missing = openLots.some((lot) => lot.costNzd == null);
        position.costBase = missing
          ? emptyFigure(
              "Cost base is each open lot's quantity × fill × the buy rate.",
              "The confirmed fill did not include an exchange rate.",
              "Ledger",
              next.asOfLabel
            )
          : figureFrom(
              openLots.reduce((sum, lot) => sum + (lot.costNzd || 0), 0),
              "Cost base is each open lot's quantity times its fill times the exchange rate on the buy.",
              openLots.map((lot) => `${lot.quantity} × ${lot.priceLocal} × ${lot.fxDisplay}`),
              "",
              "Ledger",
              next.asOfLabel
            );
      }
      const mv = position.quantity > 1e-9 ? (unit == null ? null : unit * position.quantity) : 0;
      position.marketValue = repaintFigure(
        position.marketValue,
        mv,
        mv == null ? "No price is stored for this holding." : null
      );
      if (position.marketValue.value != null && position.costBase.value != null) {
        position.unrealised = repaintFigure(position.unrealised, position.marketValue.value - position.costBase.value, null);
      }
    }
  }

  let holdings = 0;
  let holdingsMissing: string | null = null;
  for (const group of next.groups) {
    let groupValue = 0;
    let groupMissing: string | null = null;
    for (const position of group.positions) {
      if (position.closed) continue;
      if (position.marketValue.value == null) groupMissing = position.marketValue.reason || "A holding has no price.";
      else groupValue += position.marketValue.value;
    }
    group.marketValue = repaintFigure(group.marketValue, groupMissing ? null : groupValue, groupMissing);
    if (groupMissing) holdingsMissing = groupMissing;
    else holdings += groupValue;
  }
  next.kpis.holdingsValue = repaintFigure(next.kpis.holdingsValue, holdingsMissing ? null : holdings, holdingsMissing);
  next.kpis.cash = repaintFigure(next.kpis.cash, cashBalance, null);
  const net = holdingsMissing ? null : holdings + cashBalance;
  next.kpis.netWorth = repaintFigure(next.kpis.netWorth, net, holdingsMissing);
  next.grand = repaintFigure(next.grand, net, holdingsMissing);
  if (net != null && net !== 0) {
    for (const group of next.groups) {
      for (const position of group.positions) {
        const mv = position.marketValue.value;
        position.weight = repaintFigure(position.weight, mv == null ? null : mv / net, mv == null ? position.marketValue.reason : null);
        if (position.weight.value != null) {
          position.weight = {
            ...position.weight,
            display: `${(position.weight.value * 100).toFixed(2)}%`,
          };
        }
      }
    }
  }
  return next;
}
