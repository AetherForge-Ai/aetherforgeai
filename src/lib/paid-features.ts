/**
 * b32 L-4: every paid feature listed on /pricing, mapped to the code gate that decides it and
 * the page where a tester checks it ("each paid feature shows and works" on a paid account).
 * A feature line with no row here fails the test, so /pricing copy and gates cannot drift.
 */
import {
  assistantQueryLimit,
  canExportCsv,
  headmasterDepth,
  isFreeReportPlan,
  monthlyReportLimit,
  resolveTickerLimit,
} from "@/lib/entitlements";
import { planByKey, PLANS, type Plan } from "@/lib/plans";

export type PaidTier = "starter" | "pro" | "ultimate";

export interface PaidFeatureCheck {
  /** Exact /pricing line. */
  feature: string;
  /** What the code allows for this plan, in words. */
  granted: string;
  /** True when the plan's gate allows what the line promises. */
  ok: boolean;
  /** Where a tester sees it. */
  where: string;
}

type Rule = { match: RegExp; where: string; check: (plan: string, p: Plan | undefined) => { granted: string; ok: boolean } };

const num = (n: number | null) => (n == null ? "no cap" : String(n));

const RULES: Rule[] = [
  {
    match: /^Up to (\d+) holdings$/,
    where: "/dashboard (Add a holding; the cap message names the limit)",
    check: (plan, p) => {
      const limit = resolveTickerLimit({ subscription_plan: plan } as never);
      const want = Number(/(\d+)/.exec(p?.features.find((f) => /^Up to \d+ holdings$/.test(f)) || "")?.[1] || NaN);
      return { granted: `${limit} holdings`, ok: limit === want };
    },
  },
  {
    match: /^Unlimited holdings$/,
    where: "/dashboard (Add a holding)",
    check: (plan) => {
      const limit = resolveTickerLimit({ subscription_plan: plan } as never);
      return { granted: `${limit} holdings`, ok: limit >= 1000 };
    },
  },
  {
    match: /^One of Stox or Koins$/,
    where: "/dashboard Report Center (one bot runs; the other shows Unlock with Pro)",
    check: (_plan, p) => ({ granted: `bot access ${p?.botAccess ?? "?"}`, ok: p?.botAccess === "single" }),
  },
  {
    match: /^Stox and Koins$|^Everything in Pro$/,
    where: "/dashboard Report Center (both bots run)",
    check: (_plan, p) => ({ granted: `bot access ${p?.botAccess ?? "?"}`, ok: p?.botAccess === "both" }),
  },
  {
    match: /^Smitty spot prices$/,
    where: "/dashboard Metals (Smitty spot strip)",
    check: (plan) => ({ granted: isFreeReportPlan(plan) ? "free" : "paid", ok: !isFreeReportPlan(plan) }),
  },
  {
    match: /^Basic Headmaster$/,
    where: "/dashboard Strategy (basic desk; stress tests say Pro)",
    check: (plan) => ({ granted: `headmaster ${headmasterDepth(plan)}`, ok: headmasterDepth(plan) === "basic" }),
  },
  {
    match: /^Full Headmaster$|^Risk & stress testing$/,
    where: "/dashboard Strategy (full desk, stress tests)",
    check: (plan) => ({ granted: `headmaster ${headmasterDepth(plan)}`, ok: headmasterDepth(plan) === "full" }),
  },
  {
    match: /^(\d+) AI research reports per month$/,
    where: "/dashboard Report Center (quota strip: N of M left)",
    check: (plan, p) => {
      const limit = monthlyReportLimit(plan);
      const want = Number(/^(\d+)/.exec(p?.features.find((f) => /AI research reports per month$/.test(f)) || "")?.[1] || NaN);
      return { granted: `${num(limit)} reports/month`, ok: limit === want };
    },
  },
  {
    match: /^Unlimited AI research reports/,
    where: "/dashboard Report Center (cooldown line, no monthly cap)",
    check: (plan) => ({ granted: `${num(monthlyReportLimit(plan))} reports/month`, ok: monthlyReportLimit(plan) == null }),
  },
  {
    match: /^(\d+) Market Assistant queries per month$/,
    where: "Assistant panel (counter N/M)",
    check: (plan, p) => {
      const limit = assistantQueryLimit(plan);
      const want = Number(/^(\d+)/.exec(p?.features.find((f) => /Market Assistant queries per month$/.test(f)) || "")?.[1] || NaN);
      return { granted: `${num(limit)} queries/month`, ok: limit === want };
    },
  },
  {
    match: /^Unlimited Market Assistant queries$/,
    where: "Assistant panel (no counter cap)",
    check: (plan) => ({ granted: `${num(assistantQueryLimit(plan))} queries/month`, ok: assistantQueryLimit(plan) == null }),
  },
  {
    match: /^CSV export$/,
    where: "/dashboard Transactions (Export CSV) and /tax/realised (CSV)",
    check: (plan) => ({ granted: canExportCsv(plan) ? "export allowed" : "export refused", ok: canExportCsv(plan) }),
  },
  {
    match: /^CSV import of holdings$/,
    where: "/import (preview, commit, undo)",
    check: (plan) => ({ granted: isFreeReportPlan(plan) ? "free" : "paid", ok: !isFreeReportPlan(plan) }),
  },
  {
    match: /^P\/L at latest available price$|^Multi-timeframe charts and top gainers$|^Basic strategy generation and simulation$|^Illustrative pathway scenarios$/,
    where: "/dashboard Holdings, /markets charts, Strategy tab",
    check: (plan) => ({ granted: isFreeReportPlan(plan) ? "free" : "paid", ok: !isFreeReportPlan(plan) }),
  },
  {
    match: /^Email support$|^Priority support$|^Dedicated email support$|^14-day trial$/,
    where: "/help (support contact) and /pricing (trial line); service promise, no code gate",
    check: (plan) => ({ granted: isFreeReportPlan(plan) ? "free" : "paid plan", ok: !isFreeReportPlan(plan) }),
  },
];

export function ruleFor(feature: string): Rule | null {
  return RULES.find((rule) => rule.match.test(feature)) ?? null;
}

/** The sweep for one plan key (e.g. "starter_monthly"): one row per /pricing line. */
export function paidFeatureSweep(planKey: string): PaidFeatureCheck[] {
  const plan = planByKey(planKey);
  return (plan?.features ?? []).map((feature) => {
    const rule = ruleFor(feature);
    if (!rule) return { feature, granted: "no gate mapped", ok: false, where: "—" };
    const { granted, ok } = rule.check(planKey, plan);
    return { feature, granted, ok, where: rule.where };
  });
}

export const PUBLIC_PAID_PLAN_KEYS = ["starter_monthly", "pro_monthly", "ultimate_monthly"] as const;

/** Every feature line on any public paid plan. */
export function allPaidFeatureLines(): string[] {
  return [...new Set(PLANS.filter((p) => !p.archived && /^(starter|pro|ultimate)_/.test(p.key)).flatMap((p) => p.features))];
}
