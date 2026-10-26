/**
 * b65 G-07 (GOAL-LOCK #42): holding caps meter, no-card trial and refund text, built to the K-14 safe
 * default behind HOLDING_CAPS_V2 (OFF in production). The grid is derived from the same plan rows the
 * enforcement reads (resolveTickerLimit / limitScope), so the pricing grid and enforcement can't drift.
 * Prices are read, never changed: Free NZ$0, Starter NZ$16, Pro NZ$49, Ultimate NZ$199 a month.
 */
import { FREE_PLAN, PLANS } from "@/lib/plans";
import { limitScope, resolveTickerLimit } from "@/lib/entitlements";
import { ANNUAL_REFUND_RULE, MONTHLY_CANCEL_RULE } from "@/lib/public-copy";

export const UNLIMITED_FROM = 100000;

export interface HoldingCapRow {
  plan: "Free" | "Starter" | "Pro" | "Ultimate";
  key: string;
  monthlyNzd: number;
  limit: number | null;
  scope: "total" | "perBot";
  label: string;
}

function capLabel(limit: number | null, scope: "total" | "perBot"): string {
  if (limit == null) return "Unlimited holdings";
  return scope === "total" ? `Up to ${limit} holdings` : `Up to ${limit} holdings per bot`;
}

/** One row per public monthly plan, straight from plans.ts. */
export function holdingCapsGrid(): HoldingCapRow[] {
  const rows: HoldingCapRow[] = [
    { plan: "Free", key: FREE_PLAN.key, monthlyNzd: 0, limit: FREE_PLAN.tickerLimit, scope: limitScope("free"), label: "" },
  ];
  for (const name of ["Starter", "Pro", "Ultimate"] as const) {
    const p = PLANS.find((x) => !x.archived && x.name === name && x.interval === "month");
    if (!p) continue;
    const limit = p.tickerLimit >= UNLIMITED_FROM ? null : p.tickerLimit;
    rows.push({ plan: name, key: p.key, monthlyNzd: p.price, limit, scope: limitScope(p.key), label: "" });
  }
  return rows.map((r) => ({ ...r, label: capLabel(r.limit, r.scope) }));
}

/** What enforcement allows for a plan key (the add-holding gate uses the same function). */
export function enforcedCap(planKey: string): number {
  return resolveTickerLimit({ subscription_plan: planKey });
}

/** The meter line: "12 of 25 used"; unlimited reads "12 used". */
export function holdingsMeterText(used: number, limit: number | null): string {
  const u = Math.max(0, Math.floor(used));
  if (limit == null || limit >= UNLIMITED_FROM) return `${u} used`;
  return `${Math.min(u, limit)} of ${limit} used`;
}

export const NO_CARD_TRIAL_TEXT = "Starter and Pro include a 14-day trial with no card needed to start. Add a card before the trial ends to keep the plan; otherwise the trial ends and the account stays on Free.";
/** The refund text is the published /refunds policy, word for word (no new terms). */
export const REFUND_TEXT = `${MONTHLY_CANCEL_RULE} ${ANNUAL_REFUND_RULE}`;

/** Checkout payment collection: "if_required" (no card for the trial) only when the flag is ON for a trial plan. */
export function trialPaymentCollection(flagOn: boolean, trialPlan: boolean): "always" | "if_required" {
  return flagOn && trialPlan ? "if_required" : "always";
}

/** b68 G-07: meter state for the dashboard caps meter (behind HOLDING_CAPS_V2, OFF in prod). */
export type HoldingsMeterLevel = "ok" | "near" | "full" | "unlimited";
export interface HoldingsMeterState {
  text: string;
  percent: number;
  level: HoldingsMeterLevel;
  hint: string | null;
}
/** At or above this share of the cap, the meter warns. */
export const HOLDINGS_NEAR_SHARE = 0.8;

export function holdingsMeterState(used: number, limit: number | null): HoldingsMeterState {
  const u = Math.max(0, Math.floor(Number.isFinite(used) ? used : 0));
  if (limit == null || !Number.isFinite(limit) || limit >= UNLIMITED_FROM) {
    return { text: holdingsMeterText(u, null), percent: 0, level: "unlimited", hint: null };
  }
  const cap = Math.max(0, Math.floor(limit));
  const percent = cap > 0 ? Math.min(100, Math.round((Math.min(u, cap) / cap) * 100)) : 100;
  const left = Math.max(0, cap - u);
  if (u >= cap) {
    return { text: holdingsMeterText(u, cap), percent: 100, level: "full", hint: "You have reached your plan's holdings limit. See Pricing to add more." };
  }
  if (u >= Math.ceil(cap * HOLDINGS_NEAR_SHARE)) {
    return { text: holdingsMeterText(u, cap), percent, level: "near", hint: `${left} holding${left === 1 ? "" : "s"} left on your plan.` };
  }
  return { text: holdingsMeterText(u, cap), percent, level: "ok", hint: null };
}
