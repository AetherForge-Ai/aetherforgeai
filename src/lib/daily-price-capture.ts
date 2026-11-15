/**
 * Pace and batch the Twelve Data capture so one cron call stays inside
 * curl --max-time 300. Defaults match the free plan's 8 credits per minute
 * (the same 800-credit day the quote code already mentions). A run that
 * hits the cap stops and the next run resumes: stored date|market|symbol
 * keys are not requested again. Indexes are ordered first.
 */

import type { DirectoryName } from "@/lib/daily-price-directory";
import { twelveDailySymbol } from "@/lib/daily-price-twelve";
import type { DailyMarket } from "@/lib/daily-price-sources";

export interface CaptureBudget {
  creditsPerMinute: number;
  maxCreditsPerRun: number;
  batchSize: number;
  /** Stop starting new Twelve Data calls after this many milliseconds. */
  budgetMs: number;
}

export const DEFAULT_CAPTURE_BUDGET: CaptureBudget = {
  creditsPerMinute: 8,
  maxCreditsPerRun: 24,
  batchSize: 8,
  budgetMs: 240_000,
};

function boundedInt(raw: string | undefined, fallback: number, min: number, max: number): number {
  const n = Number(String(raw ?? "").trim());
  if (!Number.isInteger(n) || n < min || n > max) return fallback;
  return n;
}

/** Optional overrides. Unset values keep the defaults. No env file is changed. */
export function captureBudgetFromEnv(env: Record<string, string | undefined> = process.env): CaptureBudget {
  const creditsPerMinute = boundedInt(env.DAILY_PRICE_CREDITS_PER_MINUTE, DEFAULT_CAPTURE_BUDGET.creditsPerMinute, 1, 120);
  const batchSize = Math.min(
    creditsPerMinute,
    boundedInt(env.DAILY_PRICE_BATCH_SIZE, DEFAULT_CAPTURE_BUDGET.batchSize, 1, 8)
  );
  return {
    creditsPerMinute,
    maxCreditsPerRun: boundedInt(env.DAILY_PRICE_MAX_CREDITS_PER_RUN, DEFAULT_CAPTURE_BUDGET.maxCreditsPerRun, 1, 500),
    batchSize,
    budgetMs: boundedInt(env.DAILY_PRICE_RUN_BUDGET_MS, DEFAULT_CAPTURE_BUDGET.budgetMs, 1_000, 240_000),
  };
}

const MARKET_ORDER: Record<DailyMarket, number> = { NZX: 0, ASX: 1, DOW: 2, NASDAQ: 3 };

/** Indexes before constituents, then NZX, ASX, Dow, Nasdaq, then symbol. */
export function captureWorkOrder(names: readonly DirectoryName[]): DirectoryName[] {
  return [...names].sort((a, b) => {
    const role = Number(a.role !== "index") - Number(b.role !== "index");
    if (role) return role;
    const market = MARKET_ORDER[a.market] - MARKET_ORDER[b.market];
    if (market) return market;
    return a.symbol.localeCompare(b.symbol);
  });
}

export function batchCaptureNames(names: readonly DirectoryName[], batchSize: number): DirectoryName[][] {
  const size = Math.max(1, batchSize);
  const groups: DirectoryName[][] = [];
  let current: DirectoryName[] = [];
  let key = "";
  for (const name of names) {
    const mapped = twelveDailySymbol(name.symbol, name.market);
    const next = `${name.market}|${mapped.country || ""}`;
    if (current.length && (next !== key || current.length >= size)) {
      groups.push(current);
      current = [];
    }
    key = next;
    current.push(name);
  }
  if (current.length) groups.push(current);
  return groups;
}

/**
 * Wait until `cost` credits fit in the trailing minute. `stamps` holds the
 * time of each credit already spent. Returns the clock time after any wait.
 */
export async function waitForCredits(args: {
  cost: number;
  perMinute: number;
  stamps: number[];
  now: () => number;
  sleep: (ms: number) => Promise<void>;
}): Promise<number> {
  const windowMs = 60_000;
  const cost = Math.max(1, Math.min(args.cost, args.perMinute));
  while (true) {
    const at = args.now();
    const fresh = args.stamps.filter((stamp) => at - stamp < windowMs);
    args.stamps.splice(0, args.stamps.length, ...fresh);
    if (args.stamps.length + cost <= args.perMinute) {
      for (let i = 0; i < cost; i++) args.stamps.push(at);
      return at;
    }
    const wait = windowMs - (at - args.stamps[0]) + 1;
    await args.sleep(Math.max(wait, 1));
  }
}

export function creditWaitMs(stamps: readonly number[], now: number, cost: number, perMinute: number): number {
  const windowMs = 60_000;
  const fresh = stamps.filter((stamp) => now - stamp < windowMs);
  if (fresh.length + cost <= perMinute) return 0;
  return windowMs - (now - fresh[0]) + 1;
}
