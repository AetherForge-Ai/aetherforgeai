/**
 * CR-6: how a Stripe subscription becomes app entitlements. Pure, so the
 * webhook and the tests share one rule set.
 *
 * - The plan comes from the subscription's price id (webhook data), never from
 *   the client.
 * - active and trialing → the plan applies.
 * - past_due (card failed, Stripe retrying) → the plan is kept through the grace
 *   period; status says past_due.
 * - unpaid, canceled, incomplete_expired, incomplete → back to Free limits
 *   (10 holdings, no paid bot access).
 */
import type { Plan } from "@/lib/plans";
import { FREE_PLAN, planByKey } from "@/lib/plans";
import { testHooksAllowedFor } from "@/lib/test-hooks";

export type AppSubscriptionStatus = "active" | "past_due" | "canceled" | "none";

export function mapStripeStatus(status: string): AppSubscriptionStatus {
  if (status === "active" || status === "trialing") return "active";
  if (status === "past_due") return "past_due";
  if (status === "unpaid" || status === "canceled" || status === "incomplete_expired") return "canceled";
  return "none";
}

/**
 * b85 CR-7: has this subscription ended? Ended means canceled, unpaid or incomplete_expired, or a
 * cancel_at_period_end subscription whose current_period_end has passed. A subscription canceling at
 * period end keeps its plan until then. Pure and idempotent: the same input always gives the same answer.
 */
export function subscriptionEnded(
  sub: { status?: string | null; cancel_at_period_end?: boolean | null; cancel_at?: number | null; ended_at?: number | null; current_period_end?: number | null },
  nowMs = Date.now()
): boolean {
  const status = String(sub.status || "");
  if (status === "canceled" || status === "unpaid" || status === "incomplete_expired") return true;
  if (typeof sub.ended_at === "number" && sub.ended_at > 0 && sub.ended_at * 1000 <= nowMs) return true;
  const endAt = sub.cancel_at_period_end ? sub.current_period_end : sub.cancel_at;
  return typeof endAt === "number" && endAt > 0 && endAt * 1000 <= nowMs;
}

/** b85 CR-7: the Free patch written when a subscription has ended. Same patch on every replay. */
export function endedPatch(customerId?: string | null): EntitlementPatch {
  return entitlementPatch({ stripeStatus: "canceled", plan: undefined, customerId: customerId ?? null });
}

/** past_due keeps the plan (grace while Stripe retries the card). */
export function statusKeepsPlan(status: AppSubscriptionStatus): boolean {
  return status === "active" || status === "past_due";
}

export type EntitlementPatch = {
  subscription_status: AppSubscriptionStatus;
  subscription_plan: string;
  bot_access: string;
  ticker_limit: number;
  subscription_started_at?: string;
  subscription_expires_at?: string;
  stripe_customer_id?: string;
};

export function entitlementPatch(input: {
  stripeStatus: string;
  plan: Plan | undefined;
  botChoice?: string | null;
  metadataTickerLimit?: string | null;
  startedAt?: string;
  expiresAt?: string;
  customerId?: string | null;
}): EntitlementPatch {
  const status = mapStripeStatus(input.stripeStatus);
  const customer = input.customerId ? { stripe_customer_id: input.customerId } : {};
  if (!statusKeepsPlan(status) || !input.plan) {
    return {
      subscription_status: status === "active" && !input.plan ? "none" : status,
      subscription_plan: "none",
      bot_access: "none",
      ticker_limit: FREE_PLAN.tickerLimit,
      ...customer,
    };
  }
  const bot =
    input.plan.botAccess === "both"
      ? "both"
      : input.botChoice === "crypto" || input.botChoice === "stock"
        ? input.botChoice
        : "stock";
  const stamped = Number(input.metadataTickerLimit);
  const tickerLimit = Number.isFinite(stamped) && stamped > 0 ? Math.min(stamped, input.plan.tickerLimit) : input.plan.tickerLimit;
  return {
    subscription_status: status,
    subscription_plan: input.plan.key,
    bot_access: bot,
    ticker_limit: tickerLimit,
    ...(input.startedAt ? { subscription_started_at: input.startedAt } : {}),
    ...(input.expiresAt ? { subscription_expires_at: input.expiresAt } : {}),
    ...customer,
  };
}

/** Events this endpoint acts on. Everything else is acknowledged and ignored. */
export const HANDLED_STRIPE_EVENTS = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_failed",
  "invoice.paid",
] as const;

/** Per-isolate record of processed event ids. Replays are also safe because each sync reads the live subscription. */
const processed = new Map<string, number>();
const PROCESSED_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function alreadyProcessed(eventId: string, now = Date.now()): boolean {
  const at = processed.get(eventId);
  return at != null && now - at < PROCESSED_TTL_MS;
}

export function markProcessed(eventId: string, now = Date.now()): void {
  processed.set(eventId, now);
  if (processed.size > 5000) {
    for (const [id, at] of processed) {
      if (now - at >= PROCESSED_TTL_MS || processed.size > 4000) processed.delete(id);
      if (processed.size <= 4000) break;
    }
  }
}

export function resetProcessedEvents(): void {
  processed.clear();
}

/** b78 CR-6: an event verified by STRIPE_TEST_WEBHOOK_SECRET is accepted only when it is a test-mode event. */
export function testSecretEventAllowed(viaTestSecret: boolean, livemode: boolean | undefined): boolean {
  return !viaTestSecret || livemode === false;
}

/**
 * b80 CR-6b (safety): a test-mode event (livemode false) may change a plan only when it maps to an
 * allow-listed test account (GOAL_TEST_HOOKS=1 + id in GOAL_TEST_HOOK_USER_IDS). Live events are unaffected.
 */
export function testEventUserAllowed(
  livemode: boolean | undefined,
  userId: string | null | undefined,
  env: Record<string, string | undefined> = process.env
): boolean {
  if (livemode !== false) return true;
  return Boolean(userId) && testHooksAllowedFor({ _id: userId }, env);
}

/** Unsigned events are refused in production. Dev without a secret may parse the body. */
export function mayAcceptUnsignedEvent(nodeEnv = process.env.NODE_ENV): boolean {
  return nodeEnv !== "production";
}

/**
 * b64 CR-6: a test-mode checkout uses an inline price (no price id, no price metadata), so the
 * plan comes from the server-stamped subscription metadata. Only for test-mode objects
 * (livemode false, checkout_mode "test"), and in production only for allow-listed test accounts
 * (GOAL_TEST_HOOKS=1 + GOAL_TEST_HOOK_USER_IDS), so a Stripe test card never unlocks a paid
 * plan for a real member.
 */
export function testModePlan(
  subscription: { livemode?: boolean; metadata?: Record<string, string> | null },
  userId: string,
  env: Record<string, string | undefined> = process.env
): Plan | undefined {
  if (subscription.livemode !== false || subscription.metadata?.checkout_mode !== "test") return undefined;
  if (env.NODE_ENV === "production" && !testHooksAllowedFor({ _id: userId }, env)) return undefined;
  const plan = planByKey(subscription.metadata.plan);
  return plan && !plan.archived && !plan.key.startsWith("ultimate_") ? plan : undefined;
}
