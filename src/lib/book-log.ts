/**
 * One shared log of worth, reserve, and last price.
 * Stox, Koins, and Headmaster read this instead of each keeping a private total.
 * Net worth uses the same sum as the dashboard.
 */

import { netWorthNZD, bullionNzdPerOz, isBullionHolding, isListedStockHolding, markBookAtBullionSpot, type MetalSpotPerOz } from "@/lib/metal-valuation";
import { bookCashReserve, sharedReserveSentence } from "@/lib/headmaster-trust";
import { computeSummary, type Stock } from "@/lib/portfolio";
import { BASELINE_FX_TO_NZD, type FxRatesToNZD } from "@/lib/currency";

export interface BookFacts {
  cashNZD: number;
  stocksNZD: number;
  cryptoNZD: number;
  metalsNZD: number;
  /** Sleeve market value for the bot that is speaking. Not net worth. */
  sleeveNZD?: number;
  sleeveLabel?: string;
  prices?: Record<string, number>;
  /** Headmaster 7-day illustrated path, percent. Omit on Stox and Koins. */
  illustrated7dPct?: number | null;
  /**
   * The illustrated path saved on an earlier Headmaster report.
   * A later report reads this back. It is not kept in module memory.
   */
  priorIllustratedPath?: IllustratedPathRecord | null;
}

/** Illustrated 7-day path stored with a Headmaster report, the same way open calls are stored. */
export interface IllustratedPathRecord {
  illustrated7dPct: number;
  netWorthNZD: number;
  issuedAtMs: number;
}

export interface FullBookParts {
  cashNZD: number;
  stocksNZD: number;
  cryptoNZD: number;
  metalsNZD: number;
  netWorthNZD: number;
}

export interface SharedBookLog {
  cashNZD: number;
  stocksNZD: number;
  cryptoNZD: number;
  metalsNZD: number;
  netWorthNZD: number;
  sleeveNZD: number;
  sleeveLabel: string;
  reserveNZD: number;
  reserveCapNZD: number;
  deployableNZD: number;
  prices: Record<string, number>;
  reserveSentence: string;
  /** Set once a stored illustrated path is at least seven days old. */
  pathMiss: string | null;
  at: number;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

let current: SharedBookLog | null = null;

function finite(n: number | undefined): number {
  const v = Number(n);
  return Number.isFinite(v) ? v : 0;
}

function cleanPrices(prices: Record<string, number> | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(prices || {})) {
    const ticker = key.trim().toUpperCase();
    const price = Number(value);
    if (!ticker || !(price > 0) || !Number.isFinite(price)) continue;
    out[ticker] = price;
  }
  return out;
}

export function buildSharedBookLog(facts: BookFacts, now = Date.now()): Omit<SharedBookLog, "pathMiss" | "at"> {
  const cashNZD = finite(facts.cashNZD);
  const stocksNZD = finite(facts.stocksNZD);
  const cryptoNZD = finite(facts.cryptoNZD);
  const metalsNZD = finite(facts.metalsNZD);
  const worthNZD = netWorthNZD({
    cashNZD,
    equityNZD: stocksNZD,
    cryptoNZD,
    metalsNZD,
  });
  const reserve = bookCashReserve(worthNZD);
  const cash = Math.max(0, cashNZD);
  const deployableFromCash = Math.max(0, Math.round((cash - reserve.retainedNZD) * 100) / 100);
  return {
    cashNZD,
    stocksNZD,
    cryptoNZD,
    metalsNZD,
    netWorthNZD: worthNZD,
    sleeveNZD: finite(facts.sleeveNZD),
    sleeveLabel: facts.sleeveLabel || "Sleeve",
    reserveNZD: reserve.retainedNZD,
    reserveCapNZD: reserve.retainedNZD,
    deployableNZD: deployableFromCash,
    prices: cleanPrices(facts.prices),
    reserveSentence: sharedReserveSentence(cashNZD, worthNZD),
  };
}

/**
 * Publish the book. Worth, reserve, and prices replace the previous log so
 * the three bots cannot each keep a different total. Prices merge; a missing
 * print is left off rather than stored as zero.
 */
export function publishSharedBookLog(facts: BookFacts, now = Date.now()): SharedBookLog {
  const built = buildSharedBookLog(facts, now);
  const prices = { ...(current?.prices || {}), ...built.prices };
  const pathMiss = pathMissFromSaved(facts.priorIllustratedPath, now, built.netWorthNZD);
  current = { ...built, prices, pathMiss, at: now };
  return current;
}

export function readSharedBookLog(): SharedBookLog | null {
  return current;
}

export function resetSharedBookLog(): void {
  current = null;
}

/**
 * Cash, stocks, crypto, metals, and net worth from the positions the
 * Headmaster synthesis already marks. A missing class stays zero.
 * It is not replaced by the sleeve that happens to be speaking.
 */
export function fullBookFromPositions(
  positions: Array<{ assetClass: string; valueNZD: number }>
): FullBookParts {
  const sum = (key: string) =>
    positions
      .filter((row) => row.assetClass === key)
      .reduce((total, row) => total + (Number.isFinite(Number(row.valueNZD)) ? Number(row.valueNZD) : 0), 0);
  return fullBookParts({
    cashNZD: sum("cash"),
    stocksNZD: sum("equities"),
    cryptoNZD: sum("crypto"),
    metalsNZD: sum("metals"),
  });
}

interface HoldingRow {
  _id?: string;
  ticker?: string | null;
  asset_type?: string | null;
  company_name?: string | null;
  sector?: string | null;
  shares?: number | null;
  purchase_price?: number | null;
  current_price?: number | null;
}

/**
 * The same split the dashboard sums: listed stocks, crypto, ledger bullion
 * marked at spot, and the precious-metal desk. One result for every bot.
 */
export function fullBookFromHoldings(input: {
  rows: HoldingRow[];
  precious?: Array<{ metal: "gold" | "silver"; ounces: number; purchase_price_per_oz?: number }>;
  spot?: MetalSpotPerOz | null;
  cashNZD: number;
  fxToNZD?: FxRatesToNZD;
}): FullBookParts {
  const fx = input.fxToNZD ?? BASELINE_FX_TO_NZD;
  const asStock = (row: HoldingRow, index: number): Stock => ({
    _id: row._id || `row-${index}`,
    ticker: String(row.ticker || ""),
    asset_type: (row.asset_type as Stock["asset_type"]) || "stock",
    company_name: row.company_name || undefined,
    sector: row.sector || undefined,
    shares: Number(row.shares) || 0,
    purchase_price: Number(row.purchase_price) || 0,
    current_price: Number(row.current_price) || 0,
  });
  const rows = input.rows.map(asStock);
  const stocks = rows.filter((row) => isListedStockHolding(row.asset_type, row.ticker, row.company_name));
  const crypto = rows.filter((row) => (row.asset_type || "") === "crypto");
  const bullion = markBookAtBullionSpot(
    rows.filter((row) => isBullionHolding(row.asset_type, row.ticker, row.company_name)),
    input.spot
  );
  const stockNZD = computeSummary(stocks, { baseCurrency: "NZD", fxToNZD: fx }).totalValue;
  const cryptoNZD = computeSummary(crypto, { baseCurrency: "NZD", fxToNZD: fx }).totalValue;
  const ledgerMetalsNZD = computeSummary(bullion, { baseCurrency: "NZD", fxToNZD: fx }).totalValue;
  let deskNZD = 0;
  for (const lot of input.precious || []) {
    const ticker = lot.metal === "silver" ? "SILVER" : "GOLD";
    const spotPx = bullionNzdPerOz(ticker, input.spot);
    const mark = spotPx > 0 ? spotPx : Number(lot.purchase_price_per_oz) || 0;
    deskNZD += (Number(lot.ounces) || 0) * mark;
  }
  return fullBookParts({
    cashNZD: finite(input.cashNZD),
    stocksNZD: stockNZD,
    cryptoNZD: cryptoNZD,
    metalsNZD: ledgerMetalsNZD + deskNZD,
  });
}

function fullBookParts(parts: Omit<FullBookParts, "netWorthNZD">): FullBookParts {
  const cashNZD = finite(parts.cashNZD);
  const stocksNZD = finite(parts.stocksNZD);
  const cryptoNZD = finite(parts.cryptoNZD);
  const metalsNZD = finite(parts.metalsNZD);
  return {
    cashNZD,
    stocksNZD,
    cryptoNZD,
    metalsNZD,
    netWorthNZD: netWorthNZD({
      cashNZD,
      equityNZD: stocksNZD,
      cryptoNZD,
      metalsNZD,
    }),
  };
}

/** Read the path saved on the newest Headmaster report that has one. */
export function illustratedPathFromPayloads(payloads: unknown[]): IllustratedPathRecord | null {
  for (const raw of payloads) {
    let parsed: unknown = raw;
    if (typeof raw === "string") {
      try {
        parsed = JSON.parse(raw);
      } catch {
        continue;
      }
    }
    if (!parsed || typeof parsed !== "object") continue;
    const path = (parsed as { illustratedPath?: unknown }).illustratedPath;
    if (!path || typeof path !== "object") continue;
    const row = path as IllustratedPathRecord;
    if (!Number.isFinite(row.illustrated7dPct)) continue;
    if (!(Number(row.netWorthNZD) > 0)) continue;
    if (!Number.isFinite(row.issuedAtMs)) continue;
    return {
      illustrated7dPct: Number(row.illustrated7dPct),
      netWorthNZD: Number(row.netWorthNZD),
      issuedAtMs: Number(row.issuedAtMs),
    };
  }
  return null;
}

/** How far a saved illustrated path missed, once a week has passed. */
export function pathMissFromSaved(
  saved: IllustratedPathRecord | null | undefined,
  nowMs: number,
  currentNetWorthNZD: number
): string | null {
  if (!saved || !(saved.netWorthNZD > 0)) return null;
  const realized = ((currentNetWorthNZD - saved.netWorthNZD) / saved.netWorthNZD) * 100;
  return pathMissText(saved.issuedAtMs, nowMs, saved.illustrated7dPct, realized);
}

export interface IllustratedPathDecision {
  /** The row to write. Null means this render must not insert a report. */
  save: IllustratedPathRecord | null;
  pathMiss: string | null;
}

/**
 * Keep the first saved path until it is seven days old.
 * Only then measure the miss, and only then write the next path.
 * A render inside that week leaves the saved path and the report list alone.
 */
export function illustratedPathDecision(input: {
  saved: IllustratedPathRecord | null;
  nowMs: number;
  illustrated7dPct: number | null;
  netWorthNZD: number;
}): IllustratedPathDecision {
  const illustrated = input.illustrated7dPct;
  const canRecord =
    illustrated != null && Number.isFinite(illustrated) && input.netWorthNZD > 0;
  const next: IllustratedPathRecord | null = canRecord
    ? { illustrated7dPct: illustrated, netWorthNZD: input.netWorthNZD, issuedAtMs: input.nowMs }
    : null;
  if (!input.saved) return { save: next, pathMiss: null };
  if (!(input.nowMs - input.saved.issuedAtMs >= WEEK_MS)) return { save: null, pathMiss: null };
  return {
    save: next,
    pathMiss: pathMissFromSaved(input.saved, input.nowMs, input.netWorthNZD),
  };
}

export function pathMissText(
  issuedAtMs: number,
  nowMs: number,
  illustratedPct: number,
  realizedPct: number
): string | null {
  if (!(nowMs - issuedAtMs >= WEEK_MS)) return null;
  if (modelNumbersAreSilent(illustratedPct, 0) && Math.abs(illustratedPct) < 0.05) {
    return "The last illustrated path had no view, so there is no miss to measure.";
  }
  const miss = Math.round((realizedPct - illustratedPct) * 100) / 100;
  const shown = (n: number) => {
    const rounded = Math.round(n * 100) / 100;
    return `${rounded > 0 ? "+" : ""}${rounded}`;
  };
  return `After a week, the last illustrated path missed by ${shown(miss)} percentage points (illustrated ${shown(illustratedPct)}%, realized ${shown(realizedPct)}%).`;
}

export function modelNumbersAreSilent(ret: number, vol: number): boolean {
  return Math.abs(ret) < 0.05 && Math.abs(vol) < 0.05;
}

export function fullBookSentence(log: Pick<SharedBookLog, "cashNZD" | "stocksNZD" | "cryptoNZD" | "metalsNZD" | "netWorthNZD">): string {
  const nzd = (n: number) =>
    `NZ$${n.toLocaleString("en-NZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `Full book: cash ${nzd(log.cashNZD)}, stocks ${nzd(log.stocksNZD)}, crypto ${nzd(log.cryptoNZD)}, metals ${nzd(log.metalsNZD)}. Net worth ${nzd(log.netWorthNZD)}, the same sum as the dashboard.`;
}
