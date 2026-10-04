/**
 * Plan entitlement helpers — the single source of truth for how a user's
 * subscription plan limits what they can do (ticker quotas, counting scope).
 *
 * Pure + client/server-safe. The Stripe webhook and free-trial activation both
 * stamp `ticker_limit` + `subscription_plan` onto the user; these helpers turn
 * those fields into the concrete limits enforced in the API and reflected in
 * the dashboard UI.
 */

import {
  ASSISTANT_QUERY_LIMITS,
  FREE_PLAN,
  planByKey,
  SALES_EMAIL,
  STARTER_REPORTS_PER_MONTH,
} from "@/lib/plans";

export type AssetType = "stock" | "crypto";
export type LimitScope = "total" | "perBot";

export interface EntitlementInput {
  ticker_limit?: number | null;
  subscription_plan?: string | null;
}

/**
 * How ticker usage is counted against the limit.
 *  - Free tier: 10 holdings across both sleeves (Stox or Koins — the book is one cap).
 *  - Paid tiers: the limit applies per bot (stock and crypto each get the full quota).
 */
export function limitScope(plan?: string | null): LimitScope {
  return plan === "free" || plan === "none" || !plan ? "total" : "perBot";
}

/**
 * Holdings cap for this account.
 * Free always gets at least {@link FREE_PLAN.tickerLimit} (10), even when an
 * older record still stores the legacy stamp of 3.
 */
export function resolveTickerLimit(user: EntitlementInput): number {
  const stamped = typeof user.ticker_limit === "number" && user.ticker_limit > 0 ? user.ticker_limit : 0;
  if (isFreeReportPlan(user.subscription_plan)) {
    return Math.max(stamped, FREE_PLAN.tickerLimit);
  }
  if (stamped > 0) return stamped;
  const plan = planByKey(user.subscription_plan);
  if (plan) return plan.tickerLimit;
  return FREE_PLAN.tickerLimit;
}

/** Where an over-cap prompt should send the member. Pro for everyone below Pro; founder email at Pro and above. */
export function overCapUpgradeHref(plan?: string | null): string {
  const key = normalizePlanKey(plan);
  const atProOrAbove = key.startsWith("pro_") || key.startsWith("ultimate_");
  if (atProOrAbove) {
    return `mailto:${SALES_EMAIL}?subject=${encodeURIComponent("Founder-led onboarding")}`;
  }
  return "/pricing#pro";
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
): { allowed: boolean; used: number; limit: number; scope: LimitScope; message: string; upgradeHref: string } {
  const scope = limitScope(user.subscription_plan);
  const limit = resolveTickerLimit(user);
  const used = usedTickerCount(holdings, assetType, scope);
  const allowed = used < limit;
  const noun = scope === "total" ? "holdings" : `${assetType} holdings`;
  const href = overCapUpgradeHref(user.subscription_plan);
  const message = allowed
    ? ""
    : href.startsWith("mailto:")
      ? `You've reached your plan's limit of ${limit} monitored ${noun}. Remove a holding to add another, or talk to us about a founder-led setup.`
      : `You've reached your plan's limit of ${limit} monitored ${noun}. Upgrade to Pro for a higher cap, or remove a holding to add another.`;
  return { allowed, used, limit, scope, message, upgradeHref: href };
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
 * "month" is the free allowance: 3 reports per Auckland calendar month.
 */
export type CadenceUnit = "rolling" | "week" | "month";

/** Free tier matches Pricing: 3 AI research reports per calendar month. */
export const FREE_REPORTS_PER_MONTH = FREE_PLAN.reportsPerMonth;

/** Free Market Assistant allowance per Auckland calendar month. */
export const FREE_ASSISTANT_QUERIES_PER_MONTH = ASSISTANT_QUERY_LIMITS.free;

export function isStarterPlan(plan?: string | null): boolean {
  return normalizePlanKey(plan).startsWith("starter_");
}

export function isProPlan(plan?: string | null): boolean {
  const key = normalizePlanKey(plan);
  return key.startsWith("pro_");
}

/**
 * Market Assistant cap for this plan. Null means uncapped (Ultimate and legacy Apex).
 * Starter is 100/month and Pro is 500/month — those quotas were not previously coded.
 */
export function assistantQueryLimit(plan?: string | null): number | null {
  if (isFreeReportPlan(plan)) return ASSISTANT_QUERY_LIMITS.free;
  if (isStarterPlan(plan)) return ASSISTANT_QUERY_LIMITS.starter;
  if (isProPlan(plan)) return ASSISTANT_QUERY_LIMITS.pro;
  return null;
}

/** CSV export is a paid feature. Free and unsigned plans are refused on the server. */
export function canExportCsv(plan?: string | null): boolean {
  return !isFreeReportPlan(plan);
}

export type HeadmasterDepth = "none" | "basic" | "full";

/**
 * Free has no Headmaster plan. Starter is the basic desk (no stress tests,
 * no intelligence report). Pro, Ultimate, and legacy Apex keep the full desk.
 */
export function headmasterDepth(plan?: string | null): HeadmasterDepth {
  if (isFreeReportPlan(plan)) return "none";
  if (isStarterPlan(plan)) return "basic";
  return "full";
}

/** Auckland-month report cap. Null means the rolling paid cadence applies (unlimited). */
export function monthlyReportLimit(plan?: string | null): number | null {
  if (isFreeReportPlan(plan)) return FREE_REPORTS_PER_MONTH;
  if (isStarterPlan(plan)) return STARTER_REPORTS_PER_MONTH;
  return null;
}

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

/** Free / unsigned plans: Stox or Koins, 3 reports per month (Pricing card). */
export function isFreeReportPlan(plan?: string | null): boolean {
  const key = normalizePlanKey(plan);
  return key === "" || key === "free" || key === "none";
}

/**
 * Apex Weekly keeps a weekly report. Starter is a monthly count (15).
 * Pro, Ultimate, and legacy Apex monthly/yearly use the paid 4-hour window.
 * Free is a monthly count (see {@link monthlyReportQuota} and
 * {@link evaluateFreeReportQuota}), not this weekly window.
 */
export function isWeeklyReportPlan(plan?: string | null): boolean {
  const key = normalizePlanKey(plan);
  return key === "weekly" || key === "apex_weekly";
}

/**
 * How frequently a plan can run a full report.
 *  - Free → 3 reports per Auckland month (shared; one chosen bot).
 *  - Starter → 15 reports per Auckland month.
 *  - Apex Weekly → one report per week (rolling 7 days), per bot.
 *  - Pro, Ultimate, and other paid tiers → one report every 4 hours (rolling), per bot.
 */
export function reportCadence(plan?: string | null): ReportCadence {
  if (isFreeReportPlan(plan)) {
    return {
      unit: "month",
      ms: 0,
      label: `${FREE_REPORTS_PER_MONTH} reports per month`,
      perLabel: "per month",
    };
  }
  if (isStarterPlan(plan)) {
    return {
      unit: "month",
      ms: 0,
      label: `${STARTER_REPORTS_PER_MONTH} reports per month`,
      perLabel: "per month",
    };
  }
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

/* -------------------------------------------------------------------------- */
/*  Free monthly report allowance — 3 AI reports per calendar month           */
/*  (Pacific/Auckland). Count-based: a Free member may run reports            */
/*  back-to-back until they hit the monthly cap on their chosen bot.         */
/* -------------------------------------------------------------------------- */

/** Calendar month bucket key (Pacific/Auckland), e.g. "2026-09". Stable across DST. */
export function aucklandMonthKey(ms: number = Date.now()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Pacific/Auckland",
    year: "numeric",
    month: "2-digit",
  }).format(new Date(ms));
}

/** yyyy-mm in Pacific/Auckland. Same bucket as {@link aucklandMonthKey}. */
export function aucklandYearMonth(ms: number = Date.now()): string {
  return aucklandMonthKey(ms);
}

export interface FreeReportQuota {
  allowed: boolean;
  /** Reports already run in the current calendar month. */
  used: number;
  /** FREE_REPORTS_PER_MONTH. */
  limit: number;
  /** Reports still available this calendar month (never negative). */
  remaining: number;
  /** Pacific/Auckland "yyyy-MM" bucket this count applies to. */
  monthKey: string;
}

/**
 * Pure count-based quota check for the Free tier: pass the number of reports
 * the user has already generated within the current calendar month (the caller
 * is responsible for counting only rows whose generated_at falls in that
 * Pacific/Auckland month — this function does no I/O), and get back whether
 * another report is allowed plus a UI-ready remaining count (e.g. "2/3 left").
 */
export function evaluateFreeReportQuota(
  reportsThisMonth: number,
  now: number = Date.now(),
  limit: number = FREE_REPORTS_PER_MONTH
): FreeReportQuota {
  const used = Math.max(0, reportsThisMonth);
  const remaining = Math.max(0, limit - used);
  return { allowed: used < limit, used, limit, remaining, monthKey: aucklandMonthKey(now) };
}

/** Milliseconds until the next Pacific/Auckland calendar month starts. */
export function msUntilNextAucklandMonth(now: number = Date.now()): number {
  const [y, m] = aucklandYmd(now).split("-").map(Number);
  const next =
    m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  let t = now;
  const horizon = now + 40 * 24 * HOUR_MS;
  while (aucklandYmd(t) < next && t < horizon) t += 60 * 60 * 1000;
  while (t > now && aucklandYmd(t - 60_000) >= next) t -= 60_000;
  return Math.max(0, t - now);
}

export function countReportsInAucklandMonth(
  timestamps: Array<string | null | undefined>,
  now: number = Date.now()
): number {
  const month = aucklandYearMonth(now);
  let n = 0;
  for (const iso of timestamps) {
    if (!iso) continue;
    const t = new Date(iso).getTime();
    if (Number.isNaN(t)) continue;
    if (aucklandYearMonth(t) === month) n += 1;
  }
  return n;
}

/**
 * Free-plan allowance. `used` is how many reports were generated this
 * Auckland month (Stox and Koins share one pool on the chosen bot).
 */
export function monthlyReportQuota(
  used: number,
  now: number = Date.now(),
  limit: number = FREE_REPORTS_PER_MONTH,
  cadence: ReportCadence = reportCadence("free")
): ReportQuota {
  const allowed = used < limit;
  const waitMs = allowed ? 0 : msUntilNextAucklandMonth(now);
  return {
    allowed,
    waitMs,
    nextAllowedAt: allowed ? null : new Date(now + waitMs).toISOString(),
    lastReportAt: null,
    cadence,
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

/**
 * What the Headmaster desk is on this plan. Copy only — does not change
 * Stripe products. Every paid plan that can open /headmaster gets the same
 * planning desk; Pro's pricing line names that desk "Full Headmaster".
 */
export interface HeadmasterDeskCopy {
  badge: string;
  summary: string;
  detail: string;
}

export function headmasterDeskCopy(plan?: string | null): HeadmasterDeskCopy {
  const key = normalizePlanKey(plan);
  if (key === "dual_yearly") {
    return {
      badge: "Apex Dual",
      summary: "Included with Apex Dual",
      detail:
        "Apex Dual includes this planning desk: unified allocation, scenarios, stress tests, the strategy builder, and the Chief Strategist. The Total Portfolio Intelligence report is on the Strategy tab — it is not a separate Stox or Koins run. The Pro plan's “Full Headmaster planning & strategies” line is this same desk.",
    };
  }
  if (key.startsWith("starter_")) {
    return {
      badge: "Basic",
      summary: "Basic Headmaster",
      detail:
        "Starter includes the planning desk and a basic strategy for the current book. Risk and stress testing, and the Total Portfolio Intelligence report, open on Pro.",
    };
  }
  if (key === "pro_monthly" || key === "pro_yearly" || key === "ultimate_monthly" || key === "ultimate_yearly") {
    return {
      badge: "Included",
      summary: "Full Headmaster desk included",
      detail:
        "This plan includes the full Headmaster planning desk and the on-demand Total Portfolio Intelligence report. Open the Strategy tab to generate that report. It is not a third bot run beside Stox and Koins.",
    };
  }
  if (key && !isFreeReportPlan(key)) {
    return {
      badge: "Included",
      summary: "Planning desk included",
      detail:
        "Your paid plan includes this desk for allocation, scenarios, stress, and strategy. The intelligence report is on the Strategy tab. Pro lists the same desk as Full Headmaster planning & strategies.",
    };
  }
  return {
    badge: "Pro",
    summary: "Paid planning desk",
    detail:
      "The Headmaster planning desk opens with an active paid membership. Pro lists it as Full Headmaster planning & strategies. Apex Dual includes the same desk alongside Stox and Koins.",
  };
}
