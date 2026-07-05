/**
 * Plan entitlement helpers — the single source of truth for how a user's
 * subscription plan limits what they can do (ticker quotas, counting scope).
 *
 * Pure + client/server-safe. The Stripe webhook and free-trial activation both
 * stamp `ticker_limit` + `subscription_plan` onto the user; these helpers turn
 * those fields into the concrete limits enforced in the API and reflected in
 * the dashboard UI.
 */

import { FREE_PLAN, planByKey } from "@/lib/plans";

export type AssetType = "stock" | "crypto";
export type LimitScope = "total" | "perBot";

export interface EntitlementInput {
  ticker_limit?: number | null;
  subscription_plan?: string | null;
}

/**
 * How ticker usage is counted against the limit.
 *  - Free tier: "3 tickers — stocks OR crypto" → counted across BOTH bots.
 *  - Paid tiers: the limit applies "per bot" (stock and crypto each get the full quota).
 */
export function limitScope(plan?: string | null): LimitScope {
  return plan === "free" || plan === "none" || !plan ? "total" : "perBot";
}

/** The number of tickers this user may actively monitor (per the scope above). */
export function resolveTickerLimit(user: EntitlementInput): number {
  if (typeof user.ticker_limit === "number" && user.ticker_limit > 0) return user.ticker_limit;
  const plan = planByKey(user.subscription_plan);
  if (plan) return plan.tickerLimit;
  // Sensible floor — treat anyone without an explicit limit as the free tier.
  return FREE_PLAN.tickerLimit;
}

/** How many of the user's holdings count toward the limit for a given bot. */
export function usedTickerCount(
  holdings: { asset_type?: string | null }[],
  assetType: AssetType,
  scope: LimitScope
): number {
  if (scope === "total") return holdings.length;
  return holdings.filter((h) => (h.asset_type || "stock") === assetType).length;
}

/**
 * Full quota check for adding one more monitored ticker of `assetType`.
 * Returns whether the add is allowed plus a friendly, upgrade-oriented message.
 */
export function checkTickerQuota(
  user: EntitlementInput,
  holdings: { asset_type?: string | null }[],
  assetType: AssetType
): { allowed: boolean; used: number; limit: number; scope: LimitScope; message: string } {
  const scope = limitScope(user.subscription_plan);
  const limit = resolveTickerLimit(user);
  const used = usedTickerCount(holdings, assetType, scope);
  const allowed = used < limit;
  const noun = scope === "total" ? "tickers" : `${assetType} tickers`;
  const message = allowed
    ? ""
    : `You've reached your plan's limit of ${limit} monitored ${noun}. ` +
      `Upgrade your plan or remove a holding to add more.`;
  return { allowed, used, limit, scope, message };
}

/* -------------------------------------------------------------------------- */
/*  Report cadence — how often a plan may run a full SuperGrok report          */
/* -------------------------------------------------------------------------- */

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

export type CadenceUnit = "day" | "week";

export interface ReportCadence {
  unit: CadenceUnit;
  /** Minimum spacing between two full reports, in ms. */
  ms: number;
  /** e.g. "1 report per week". */
  label: string;
  /** e.g. "per week". */
  perLabel: string;
}

/**
 * How frequently a plan can run a full report (one report across BOTH bots per
 * window — "either a stock or a crypto report", per the plan copy):
 *  - Free & Apex Weekly → one report per week.
 *  - Apex Monthly / Yearly / Dual → one report per day.
 */
export function reportCadence(plan?: string | null): ReportCadence {
  const daily = plan === "monthly" || plan === "yearly" || plan === "dual_yearly";
  return daily
    ? { unit: "day", ms: DAY_MS, label: "1 report per day", perLabel: "per day" }
    : { unit: "week", ms: WEEK_MS, label: "1 report per week", perLabel: "per week" };
}

export interface ReportQuota {
  allowed: boolean;
  /** ms until the next report unlocks (0 when allowed now). */
  waitMs: number;
  /** ISO timestamp when the next report unlocks, or null when allowed now. */
  nextAllowedAt: string | null;
  lastReportAt: string | null;
  cadence: ReportCadence;
}

/**
 * Decides whether the user may run another full report, given when their last
 * one was generated. Pure + client/server-safe so the dashboard countdown and
 * the server-side gate agree exactly.
 */
export function checkReportQuota(
  plan: string | null | undefined,
  lastReportAtIso: string | null | undefined,
  now: number = Date.now()
): ReportQuota {
  const cadence = reportCadence(plan);
  const last = lastReportAtIso ? new Date(lastReportAtIso).getTime() : NaN;
  if (!lastReportAtIso || Number.isNaN(last)) {
    return { allowed: true, waitMs: 0, nextAllowedAt: null, lastReportAt: null, cadence };
  }
  const nextMs = last + cadence.ms;
  const waitMs = Math.max(0, nextMs - now);
  return {
    allowed: waitMs <= 0,
    waitMs,
    nextAllowedAt: waitMs > 0 ? new Date(nextMs).toISOString() : null,
    lastReportAt: lastReportAtIso,
    cadence,
  };
}

/** Human "2d 4h 15m" / "3h 2m" / "< 1m" duration for countdowns. */
export function formatDuration(ms: number): string {
  if (ms <= 0) return "now";
  const totalMin = Math.floor(ms / 60000);
  const days = Math.floor(totalMin / (60 * 24));
  const hours = Math.floor((totalMin % (60 * 24)) / 60);
  const mins = totalMin % 60;
  const parts: string[] = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (mins && !days) parts.push(`${mins}m`);
  if (!parts.length) return "< 1m";
  return parts.join(" ");
}
