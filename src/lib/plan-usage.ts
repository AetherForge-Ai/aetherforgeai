/**
 * Plan & billing facts for Settings. Display only.
 * Prices stay the published NZ$ ladder. No new checkout and no tax line.
 */

import { formatDisplayDate, formatNzd } from "@/lib/currency";
import {
  assistantQueryLimit,
  isFreeReportPlan,
  isProPlan,
  isStarterPlan,
  monthlyReportLimit,
  normalizePlanKey,
} from "@/lib/entitlements";
import { planByKey, planLabel } from "@/lib/plans";

export const PUBLISHED_PLAN_LADDER =
  "Free, Starter, Pro and Ultimate. Holdings 10 / 25 / 75 / unlimited. Reports 3 / 15 / unlimited. Market Assistant 20 / 100 / 500, and unlimited on Ultimate.";

/** Published prices. Monthly NZ$0 / 16 / 49 / 199. Yearly NZ$160 / 490 / 1,990. */
export const PUBLISHED_PLAN_PRICES = `Free ${formatNzd(0)}, Starter ${formatNzd(16)} a month or ${formatNzd(160)} a year, Pro ${formatNzd(49)} a month or ${formatNzd(490)} a year, Ultimate ${formatNzd(199)} a month or ${formatNzd(1990)} a year.`;

/**
 * Apex Dual is a legacy yearly membership. It is not a card on /pricing.
 * Pro's Headmaster desk is the same planning desk.
 */
export const APEX_DUAL_PUBLIC_NOTE =
  "Apex Dual is a legacy yearly membership for people who already have it. It is not one of the published plans (Free, Starter, Pro, Ultimate). It includes Stox and Koins together, and the same Headmaster planning desk that Pro lists as Full Headmaster. New members choose a published plan.";

export interface PlanSnapshot {
  planName: string;
  renewal: string;
  holdings: string;
  reports: string;
  assistant: string;
  scopeNote: string;
  apexNote: string;
  prices: string;
  ladder: string;
  upgradeHref: "/pricing";
}

function holdingsCap(plan?: string | null): { cap: string; scopeNote: string } {
  const key = normalizePlanKey(plan);
  if (key === "dual_yearly" || key === "apex_dual") {
    return {
      cap: "20 per bot",
      scopeNote: "Apex Dual counts holdings per bot. The published ladder is 10 / 25 / 75 / unlimited.",
    };
  }
  if (key.startsWith("ultimate")) {
    return { cap: "unlimited", scopeNote: "Ultimate does not cap holdings." };
  }
  if (isFreeReportPlan(plan)) {
    return { cap: "10", scopeNote: "Free counts holdings across the whole book." };
  }
  if (isStarterPlan(plan)) {
    return { cap: "25", scopeNote: "Starter counts holdings per bot." };
  }
  if (isProPlan(plan)) {
    return { cap: "75", scopeNote: "Pro counts holdings per bot." };
  }
  const stamped = planByKey(key);
  if (stamped && stamped.tickerLimit >= 100000) {
    return { cap: "unlimited", scopeNote: "" };
  }
  if (stamped) {
    return { cap: String(stamped.tickerLimit), scopeNote: "This legacy plan uses the cap stored on the account." };
  }
  return { cap: "10", scopeNote: "Free counts holdings across the whole book." };
}

function capLabel(limit: number | null): string {
  if (limit == null) return "unlimited";
  return String(limit);
}

export function usageAgainst(used: number | null, cap: string): string {
  if (used == null) return `— / ${cap}`;
  const safe = Number.isFinite(used) ? Math.max(0, Math.floor(used)) : 0;
  return `${safe} / ${cap}`;
}

export function currentPlanName(plan?: string | null, status?: string | null): string {
  const key = normalizePlanKey(plan);
  if (key === "dual_yearly" || key === "apex_dual") return "Apex Dual";
  if (status === "active" && !isFreeReportPlan(plan)) {
    const label = planLabel(plan);
    return label === "Free account" ? "Free" : label;
  }
  return "Free";
}

export function renewalLabel(iso?: string | null, plan?: string | null, status?: string | null): string {
  if (isFreeReportPlan(plan) || status !== "active") return "No renewal date";
  if (!iso) return "No renewal date";
  const text = formatDisplayDate(iso);
  return text === "—" ? "No renewal date" : text;
}

export function describeAccountPlan(input: {
  plan?: string | null;
  status?: string | null;
  expiresAt?: string | null;
  holdingsUsed: number | null;
  reportsUsed: number | null;
  assistantUsed: number | null;
}): PlanSnapshot {
  const holdings = holdingsCap(input.plan);
  const reports = capLabel(monthlyReportLimit(input.plan));
  const assistant = capLabel(assistantQueryLimit(input.plan));
  return {
    planName: currentPlanName(input.plan, input.status),
    renewal: renewalLabel(input.expiresAt, input.plan, input.status),
    holdings: usageAgainst(input.holdingsUsed, holdings.cap),
    reports: usageAgainst(input.reportsUsed, reports),
    assistant: usageAgainst(input.assistantUsed, assistant),
    scopeNote: holdings.scopeNote,
    apexNote: APEX_DUAL_PUBLIC_NOTE,
    prices: PUBLISHED_PLAN_PRICES,
    ladder: PUBLISHED_PLAN_LADDER,
    upgradeHref: "/pricing",
  };
}
