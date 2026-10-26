/**
 * Goal b11 CR-1: one checkout path for /api/stripe/checkout and
 * /api/stripe/create-checkout-session. Signed-in users only; the customer and
 * client_reference_id come from the session user, never from the body.
 * In test mode the line item is built from plans.ts (Starter monthly = 1600 NZD)
 * and the response echoes { testMode: true, priceId, unitAmount }.
 */
import "server-only";
import type { AppUser } from "@/lib/session";
import type { Plan as PlanDef } from "@/lib/plans";
import { isSelfServeCheckoutPlan } from "@/lib/plans";
import { publicPriceSlot } from "@/lib/public-catalog";
import { ensurePublicPrice } from "@/lib/ensure-public-price";
import { totalumSdk } from "@/lib/totalum";
import { checkoutStripe } from "@/lib/stripe-mode";
import { HOLDING_CAPS_V2 } from "@/lib/feature-flags";
import { trialPaymentCollection } from "@/lib/holding-caps";

/** b80 CR-6b: shown when the site is in test mode and the member is not an allow-listed test account. */
export const CHECKOUT_UNAVAILABLE = "Checkout is not available right now. Please try again later.";

export const TEST_KEY_MISSING = "Checkout is in Stripe test mode and no test key is configured.";

export function planUnitAmount(plan: Pick<PlanDef, "price">): number {
  return Math.round(plan.price * 100);
}

export type CheckoutResult =
  | { ok: true; status: 200; data: { url: string | null; sessionId: string; testMode?: true; priceId?: string; unitAmount?: number; currency?: "nzd"; plan?: string } }
  | { ok: false; status: number; error: string };

export async function createPlanCheckout(opts: { user: AppUser; plan: PlanDef; bot?: "stock" | "crypto"; baseUrl: string; cancelPath?: string }): Promise<CheckoutResult> {
  const { user, plan, baseUrl } = opts;
  const { mode, client, blocked } = checkoutStripe(user._id);
  if (blocked) return { ok: false, status: 503, error: CHECKOUT_UNAVAILABLE };
  if (!client) return { ok: false, status: 503, error: TEST_KEY_MISSING };

  const selfServe = isSelfServeCheckoutPlan(plan);
  const botAccess = plan.botAccess === "both" ? "both" : opts.bot === "crypto" ? "crypto" : "stock";
  const meta = { userId: user._id, plan: plan.key, ticker_limit: String(plan.tickerLimit), bot_access: botAccess, checkout_mode: mode };
  const subscriptionData: Record<string, unknown> = {
    metadata: meta,
    description: `${plan.name} — AetherForge AI paper portfolio and research reports (NZD). Not a broker.`,
  };
  if (selfServe) subscriptionData.trial_period_days = 14;
  // b65 G-07: no-card trial only behind HOLDING_CAPS_V2 (OFF in prod). OFF keeps "always", as before.
  const paymentCollection = trialPaymentCollection(HOLDING_CAPS_V2, selfServe);
  if (paymentCollection === "if_required") subscriptionData.trial_settings = { end_behavior: { missing_payment_method: "cancel" } };
  const common = {
    mode: "subscription" as const,
    client_reference_id: user._id,
    metadata: meta,
    subscription_data: subscriptionData as any,
    payment_method_collection: paymentCollection,
    locale: "en" as const,
    success_url: `${baseUrl}/stripe/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}${opts.cancelPath || "/pricing"}`,
    allow_promotion_codes: true,
  };

  if (mode === "test") {
    const unitAmount = planUnitAmount(plan);
    const interval = plan.interval === "year" ? "year" : plan.interval === "week" ? "week" : "month";
    const session = await client.checkout.sessions.create({
      ...common,
      customer_email: user.email,
      line_items: [
        {
          quantity: 1,
          price_data: { currency: "nzd", unit_amount: unitAmount, recurring: { interval }, product_data: { name: `AetherForge AI — ${plan.name} (test)`, metadata: { aetherforge_catalog: "test-harness", plan: plan.key } } },
        },
      ],
    });
    return {
      ok: true,
      status: 200,
      data: { url: session.url, sessionId: session.id, testMode: true, priceId: `inline:${plan.key}`, unitAmount, currency: "nzd", plan: plan.key },
    };
  }

  // Live: only when STRIPE_CHECKOUT_MODE=live is set explicitly.
  const slot = publicPriceSlot(plan.key);
  const priceId = slot ? await ensurePublicPrice(slot.key) : plan.priceId;
  let customerId = user.stripe_customer_id || undefined;
  if (!customerId) {
    const customer = await client.customers.create({ email: user.email, name: user.name, metadata: { userId: user._id } });
    customerId = customer.id;
    await totalumSdk.crud.editRecordById("user", user._id, { stripe_customer_id: customerId });
  }
  const session = await client.checkout.sessions.create({ ...common, customer: customerId, line_items: [{ price: priceId, quantity: 1 }] });
  return { ok: true, status: 200, data: { url: session.url, sessionId: session.id } };
}
