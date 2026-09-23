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

const HOUR_MS = 60 * 60 * 1000;
const WEEK_MS = 7 * 24 * HOUR_MS;

/**
 * Paid Stox/Koins refresh spacing. A calendar-day lock until Pacific/Auckland
 * midnight left a morning report stale all afternoon (~15h). Four hours keeps
 * a cooldown without pinning the desk to NZ midnight.
 */
export const PAID_REPORT_REFRESH_MS = 4 * HOUR_MS;

/**
 * "rolling" is the paid 4-hour window. It must not be the legacy "day" token:
 * that token used to mean "locked until the next Pacific/Auckland midnight",
 * which is what painted "next refresh in 48m (NZ midnight)" on a same-day report.
 */
export type CadenceUnit = "rolling" | "week";

export interface ReportCadence {
  unit: CadenceUnit;
  /** Minimum spacing between two full reports, in ms. */
  ms: number;
  /** e.g. "1 report per week". */
  label: string;
  /** e.g. "per week". */
  perLabel: string;
}

/** Normalise Stripe / display plan strings ("Pro Monthly", "pro-annual") to a key. */
export function normalizePlanKey(plan?: string | null): string {
  return (plan || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/_annual$/, "_yearly")
    .replace(/_annually$/, "_yearly");
}

/**
 * Free trial and Apex Weekly keep a weekly report. Every other plan — including
 * legacy Apex monthly/yearly and Starter/Pro/Ultimate — is the paid 4-hour window.
 */
export function isWeeklyReportPlan(plan?: string | null): boolean {
  const key = normalizePlanKey(plan);
  return key === "" || key === "free" || key === "none" || key === "weekly" || key === "apex_weekly";
}

/**
 * How frequently a plan can run a full report. Stox and Koins are metered
 * separately by the caller (one allowance each):
 *  - Free & Apex Weekly → one report per week (rolling 7 days).
 *  - Paid tiers → one report every 4 hours (rolling), not locked until NZ midnight.
 */
export function reportCadence(plan?: string | null): ReportCadence {
  if (isWeeklyReportPlan(plan)) {
    return { unit: "week", ms: WEEK_MS, label: "1 report per week", perLabel: "per week" };
  }
  return {
    unit: "rolling",
    ms: PAID_REPORT_REFRESH_MS,
    label: "1 report every 4 hours",
    perLabel: "every 4 hours",
  };
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

/** Auckland calendar date yyyy-mm-dd (Pacific/Auckland). Client + server safe. */
export function aucklandYmd(ms: number = Date.now()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Pacific/Auckland",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ms));
}

/** Absolute timestamp in Pacific/Auckland (NZST/NZDT), for report labels. */
export function formatAucklandDateTime(input: number | Date | string | null | undefined): string {
  if (input == null || input === "") return "—";
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-NZ", {
    timeZone: "Pacific/Auckland",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hourCycle: "h12",
    timeZoneName: "short",
  }).format(d);
}

/**
 * Decides whether the user may run another full report, given when their last
 * one was generated. Pure + client/server-safe so the dashboard countdown and
 * the server-side gate agree exactly.
 *
 * Paid plans use a rolling 4-hour window so a morning report can be refreshed
 * the same Auckland day. Weekly plans keep a rolling 7-day window.
 */
/**
 * Quota for an already-resolved cadence. Paid and weekly both use
 * `last + cadence.ms`. There is no Auckland-midnight branch.
 */
export function evaluateReportQuota(
  cadence: ReportCadence,
  lastReportAtIso: string | null | undefined,
  now: number = Date.now()
): ReportQuota {
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

export function checkReportQuota(
  plan: string | null | undefined,
  lastReportAtIso: string | null | undefined,
  now: number = Date.now()
): ReportQuota {
  return evaluateReportQuota(reportCadence(plan), lastReportAtIso, now);
}

/** Plain-English wait copy for report cooldowns (NZ English). */
export function formatDuration(ms: number): string {
  if (ms <= 0) return "now";
  const totalMin = Math.floor(ms / 60000);
  const days = Math.floor(totalMin / (60 * 24));
  const hours = Math.floor((totalMin % (60 * 24)) / 60);
  const mins = totalMin % 60;
  const parts: string[] = [];
  if (days) parts.push(days === 1 ? "1 day" : `${days} days`);
  if (hours) parts.push(hours === 1 ? "1 hour" : `${hours} hours`);
  // Show minutes when under a day, or when hours are zero (e.g. "2 days 5 minutes").
  if (mins && days === 0) parts.push(mins === 1 ? "1 minute" : `${mins} minutes`);
  if (!parts.length) return "less than a minute";
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts[0]}, ${parts[1]} and ${parts[2]}`;
}

/** Compact relative age, e.g. "12m ago", "3h ago", "2d ago" (NZ English). */
export function formatAgeAgo(msAgo: number): string {
  if (msAgo < 0) msAgo = 0;
  const totalMin = Math.floor(msAgo / 60000);
  if (totalMin < 1) return "just now";
  if (totalMin < 60) return `${totalMin}m ago`;
  const hours = Math.floor(totalMin / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/** Compact remaining wait, e.g. "4h", "35m", "2h 10m". */
export function formatWaitShort(ms: number): string {
  if (ms <= 0) return "now";
  const totalMin = Math.floor(ms / 60000);
  if (totalMin < 60) return `${Math.max(1, totalMin)}m`;
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  if (hours < 48) return mins ? `${hours}h ${mins}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

/**
 * Stox/Koins cooldown line: "Generated 3h ago · next refresh in 1h".
 * Age is relative; absolute report timestamps are formatted in Pacific/Auckland.
 */
export function formatReportCooldownLine(opts: {
  lastReportAt: string | null | undefined;
  waitMs: number;
  /** Ignored for copy. Kept so older callers still type-check. Never means midnight. */
  cadenceUnit?: CadenceUnit | "day";
  /** e.g. "every 4 hours" or "per week". Appended so the window is explicit. */
  perLabel?: string;
  now?: number;
}): string {
  const now = opts.now ?? Date.now();
  const last = opts.lastReportAt ? new Date(opts.lastReportAt).getTime() : NaN;
  if (!opts.lastReportAt || Number.isNaN(last)) return "Ready to run";
  const ago = formatAgeAgo(now - last);
  const windowLabel = opts.perLabel ? ` · ${opts.perLabel}` : "";
  if (opts.waitMs <= 0) return `Generated ${ago} · ready to refresh${windowLabel}`;
  return `Generated ${ago} · next refresh in ${formatWaitShort(opts.waitMs)}${windowLabel}`;
}
