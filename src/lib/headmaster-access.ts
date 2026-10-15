import { isStripeConfigured, type AppUser } from "@/lib/session";
import { headmasterDepth, type HeadmasterDepth } from "@/lib/entitlements";

/**
 * Headmaster depth for this member (moved out of the route module: a Next.js
 * route file may only export handlers).
 * Demo mode (no Stripe key) stays open so local testing is not locked out.
 * In production, Free has no plan, Starter is basic, and Pro and above are full.
 */
export function headmasterAccess(user: AppUser | null): HeadmasterDepth {
  if (!user) return "none";
  if (!isStripeConfigured()) return "full";
  return headmasterDepth(user.subscription_plan);
}

/** Basic or full desk. Free is refused when Stripe is configured. */
export function isTotalumEntitled(user: AppUser | null): boolean {
  return headmasterAccess(user) !== "none";
}

/** Stress tests, the intelligence report, and the strategist. */
export function isFullHeadmaster(user: AppUser | null): boolean {
  return headmasterAccess(user) === "full";
}
