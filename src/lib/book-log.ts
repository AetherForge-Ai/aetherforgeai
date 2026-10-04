/**
 * One shared log of worth, reserve, and last price.
 * Stox, Koins, and Headmaster read this instead of each keeping a private total.
 * Net worth uses the same sum as the dashboard.
 */

import { netWorthNZD } from "@/lib/metal-valuation";
import { bookCashReserve, sharedReserveSentence } from "@/lib/headmaster-trust";

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
let anchor: { at: number; netWorthNZD: number; illustrated7dPct: number } | null = null;

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
  let pathMiss: string | null = current?.pathMiss ?? null;
  const illustrated = facts.illustrated7dPct;
  if (typeof illustrated === "number" && Number.isFinite(illustrated)) {
    if (anchor && now - anchor.at >= WEEK_MS && anchor.netWorthNZD > 0) {
      const realized = ((built.netWorthNZD - anchor.netWorthNZD) / anchor.netWorthNZD) * 100;
      pathMiss = pathMissText(anchor.at, now, anchor.illustrated7dPct, realized);
      anchor = { at: now, netWorthNZD: built.netWorthNZD, illustrated7dPct: illustrated };
    } else if (!anchor) {
      anchor = { at: now, netWorthNZD: built.netWorthNZD, illustrated7dPct: illustrated };
    }
  }
  current = { ...built, prices, pathMiss, at: now };
  return current;
}

export function readSharedBookLog(): SharedBookLog | null {
  return current;
}

export function resetSharedBookLog(): void {
  current = null;
  anchor = null;
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
