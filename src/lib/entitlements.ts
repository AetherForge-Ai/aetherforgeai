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
