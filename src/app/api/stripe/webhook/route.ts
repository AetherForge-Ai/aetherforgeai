/**
 * Stripe Webhook Handler API Route
 *
 * This endpoint handles Stripe webhook events for real-time updates on:
 * - Customer creation/updates
 * - Subscription lifecycle (created, updated, deleted)
 * - Payment intents (succeeded, failed)
 * - Invoices
 *
 * Events to subscribe to:
 * - customer.created, customer.updated, customer.deleted
 * - customer.subscription.created, customer.subscription.updated, customer.subscription.deleted
 * - payment_intent.succeeded, payment_intent.payment_failed
 * - invoice.paid, invoice.payment_failed
 */

import { NextResponse } from "next/server";
import { stripe, STRIPE_WEBHOOK_SECRETS, STRIPE_TEST_WEBHOOK_SECRETS, cryptoProvider } from "@/lib/stripe";
import Stripe from "stripe";
import { totalumSdk } from "@/lib/totalum";
import { planByPriceId, planByKey, parsePaymentLinkRef } from "@/lib/plans";
import { PUBLIC_CATALOG } from "@/lib/public-catalog";
import {
  alreadyProcessed,
  entitlementPatch,
  markProcessed,
  mayAcceptUnsignedEvent,
  testModePlan,
  testSecretEventAllowed,
  testEventUserAllowed,
} from "@/lib/stripe-entitlement";
import { testSecretKey } from "@/lib/stripe-mode";
import { withTimeout, userIdFromEventObject, WEBHOOK_IO_TIMEOUT_MS } from "@/lib/stripe-webhook-util";

/**
 * b64 CR-6: read objects back with the client for the event's own mode. A test-mode event
 * (livemode false) is re-read with the test key, never the live key, so replays and
 * out-of-order test events resolve to Stripe's current state instead of the stale event copy.
 */
let testReader: Stripe | null = null;
function readerFor(livemode: boolean | undefined): Stripe {
  if (livemode === false) {
    const key = testSecretKey();
    if (key) {
      if (!testReader) testReader = new Stripe(key, { apiVersion: "2025-09-30.clover", typescript: true, httpClient: Stripe.createFetchHttpClient() });
      return testReader;
    }
  }
  return stripe;
}

type SubscriptionPatch = {
  subscription_status?: string;
  subscription_plan?: string;
  stripe_customer_id?: string;
  subscription_started_at?: string;
  subscription_expires_at?: string;
  ticker_limit?: number;
  bot_access?: string;
};

function unixToIso(unix?: number | null): string | undefined {
  if (!unix || !isFinite(unix)) return undefined;
  return new Date(unix * 1000).toISOString();
}

/** Resolve our internal user _id from a Stripe customer id. */
async function findUserIdByCustomer(customerId: string | null): Promise<string | null> {
  if (!customerId) return null;
  try {
    const res = await withTimeout(totalumSdk.crud.query("user", {
      _filter: { stripe_customer_id: customerId },
      _limit: 1,
    }), WEBHOOK_IO_TIMEOUT_MS, "customer lookup");
    const rows = (res?.data as any[]) || [];
    return rows[0]?._id ?? null;
  } catch (err) {
    console.error("[webhook] findUserIdByCustomer error:", err);
    return null;
  }
}

async function updateUserSubscription(userId: string, patch: SubscriptionPatch) {
  try {
    await withTimeout(totalumSdk.crud.editRecordById("user", userId, patch), WEBHOOK_IO_TIMEOUT_MS, "user update");
    console.log(`[webhook] Updated user ${userId} subscription:`, patch);
  } catch (err) {
    console.error(`[webhook] Failed to update user ${userId}:`, err);
    throw err;
  }
}

function planFromSubscription(subscription: Stripe.Subscription) {
  const price = subscription.items?.data?.[0]?.price;
  const priceId = typeof price === "string" ? price : price?.id;
  const byId = planByPriceId(priceId);
  if (byId) return byId;
  if (typeof price === "object" && price?.metadata?.aetherforge_catalog === PUBLIC_CATALOG) {
    const fromPrice = planByKey(price.metadata.plan);
    if (fromPrice) return fromPrice;
  }
  // No price match: no plan. Metadata alone never grants a plan.
  return undefined;
}

/**
 * Re-read the subscription from Stripe so the newest state always wins. A replayed
 * or out-of-order event then writes the same patch again (CR-6 idempotency).
 */
async function liveSubscription(subscription: Stripe.Subscription): Promise<Stripe.Subscription> {
  try {
    return await withTimeout(readerFor(subscription.livemode).subscriptions.retrieve(subscription.id), WEBHOOK_IO_TIMEOUT_MS, "subscription read");
  } catch (err) {
    console.warn("[webhook] live subscription read failed; using event copy", subscription.id, err instanceof Error ? err.message : "error");
    return subscription;
  }
}

async function syncSubscription(
  eventSubscription: Stripe.Subscription,
  overrides?: { userId?: string | null; botAccess?: "stock" | "crypto" | null }
) {
  const subscription = await liveSubscription(eventSubscription);
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id;
  // Resolution order: explicit override (Payment Link client_reference_id) →
  // subscription metadata (stamped server-side) → customer lookup.
  const userId =
    overrides?.userId ||
    (subscription.metadata?.userId as string) ||
    (await findUserIdByCustomer(customerId ?? null));
  if (!userId) {
    console.warn("[webhook] No user found for subscription", subscription.id);
    return;
  }

  // The plan comes from the purchased price id (webhook data only).
  const planDef = planFromSubscription(subscription) ?? testModePlan(subscription, userId);

  // Prefer real Stripe billing-period bounds; fall back to plan durationDays.
  const sub = subscription as unknown as { current_period_start?: number; current_period_end?: number };
  const item0 = subscription.items?.data?.[0] as unknown as { current_period_start?: number; current_period_end?: number } | undefined;
  const startUnix = sub.current_period_start ?? item0?.current_period_start;
  const endUnix = sub.current_period_end ?? item0?.current_period_end;

  const startedAt = unixToIso(startUnix) ?? new Date().toISOString();
  const expiresAt =
    unixToIso(endUnix) ??
    (planDef ? new Date(Date.now() + planDef.durationDays * 86400_000).toISOString() : undefined);

  const patch = entitlementPatch({
    stripeStatus: subscription.status,
    plan: planDef,
    botChoice: overrides?.botAccess || (subscription.metadata?.bot_access as string) || null,
    metadataTickerLimit: (subscription.metadata?.ticker_limit as string) || null,
    startedAt,
    expiresAt,
    customerId: customerId ?? null,
  });

  await updateUserSubscription(userId, patch);
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  console.log("Checkout completed:", session.id);

  // Payment Links carry the user (and single-bot choice) in client_reference_id;
  // dynamic Checkout Sessions carry it in metadata.userId.
  const ref = parsePaymentLinkRef(session.client_reference_id);
  const userId = (session.metadata?.userId as string) || ref.userId || null;
  const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;

  if (session.mode === "subscription" && session.subscription) {
    const subId = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
    try {
      const reader = readerFor(session.livemode);
      let subscription = await reader.subscriptions.retrieve(subId);

      // Payment Links create a subscription WITHOUT our identity metadata (the
      // user only rides along on the session's client_reference_id). Stamp it
      // onto the subscription now so every future lifecycle event — renewals,
      // cancellations, failed payments — can resolve the user + entitlements
      // directly from subscription.metadata, exactly like a dynamic Checkout.
      if (userId && !subscription.metadata?.userId) {
        const planDef = planFromSubscription(subscription);
        const botAccess =
          planDef?.botAccess === "both" ? "both" : ref.bot || (subscription.metadata?.bot_access as string) || "stock";
        const stamped: Record<string, string> = {
          userId,
          plan: planDef?.key ?? (subscription.metadata?.plan as string) ?? "",
          ticker_limit: planDef ? String(planDef.tickerLimit) : (subscription.metadata?.ticker_limit as string) ?? "",
          bot_access: botAccess,
        };
        try {
          subscription = await reader.subscriptions.update(subId, { metadata: stamped });
          console.log(`[webhook] Stamped identity on subscription ${subId}:`, stamped);
        } catch (stampErr) {
          // Non-fatal: fall back to the in-memory overrides for this sync.
          console.error("[webhook] Failed to stamp subscription metadata:", stampErr);
          subscription.metadata = { ...(subscription.metadata || {}), ...stamped };
        }
      }

      await syncSubscription(subscription, { userId, botAccess: ref.bot });
      return;
    } catch (err) {
      console.error("[webhook] Failed to retrieve subscription:", err);
    }
  }

  // No subscription could be read. Nothing is granted from session data alone;
  // customer.subscription.created/updated will sync the plan from Stripe.
  if (userId && customerId) {
    await updateUserSubscription(userId, { stripe_customer_id: customerId });
  }
}

async function handleSubscriptionCreated(subscription: Stripe.Subscription) {
  console.log("Subscription created:", subscription.id);
  await syncSubscription(subscription);
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  console.log("Subscription updated:", subscription.id);
  await syncSubscription(subscription);
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  console.log("Subscription deleted:", subscription.id);
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id;
  const userId = (subscription.metadata?.userId as string) || (await findUserIdByCustomer(customerId ?? null));
  if (userId) {
    // Back to Free limits at period end (Stripe sends deleted when the period ends).
    await updateUserSubscription(userId, entitlementPatch({ stripeStatus: "canceled", plan: undefined }));
  }
}

async function handlePaymentIntentSucceeded(paymentIntent: Stripe.PaymentIntent) {
  console.log("[webhook] payment_intent.succeeded (log only):", paymentIntent.id);
}

async function handlePaymentIntentFailed(paymentIntent: Stripe.PaymentIntent) {
  console.log("[webhook] payment_intent.payment_failed (log only):", paymentIntent.id);
}

async function handleInvoicePaid(invoice: Stripe.Invoice) {
  console.log("[webhook] invoice.paid (log only):", invoice.id);
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  // Dunning: Stripe retries the card and (in test mode) sends its own notice.
  // The app keeps the plan through past_due (see stripe-entitlement.ts) and has a
  // paymentFailedMail template in renewal-reminder.ts. The app sends no email here.
  console.log("[webhook] invoice.payment_failed (plan kept through grace):", invoice.id);
}

export async function POST(req: Request) {
  try {
    const body = await req.text();
    const signature = req.headers.get("stripe-signature");

    if (!signature) {
      return NextResponse.json(
        { error: "Missing stripe-signature header" },
        { status: 400 }
      );
    }

    let event: Stripe.Event;

    // Verify webhook signature using async method for Cloudflare Workers compatibility.
    // Try every configured signing secret (preview + production endpoints have
    // different secrets) and accept the event if ANY of them validates.
    // b78 CR-6: the TEST-mode endpoint's secret (STRIPE_TEST_WEBHOOK_SECRET) is tried after the live ones.
    const allSecrets = [
      ...STRIPE_WEBHOOK_SECRETS.map((secret) => ({ secret, test: false })),
      ...STRIPE_TEST_WEBHOOK_SECRETS.map((secret) => ({ secret, test: true })),
    ];
    if (allSecrets.length) {
      let verified: Stripe.Event | null = null;
      let viaTestSecret = false;
      let lastError = "";
      for (const { secret, test } of allSecrets) {
        try {
          verified = await stripe.webhooks.constructEventAsync(
            body,
            signature,
            secret,
            undefined,
            cryptoProvider
          );
          viaTestSecret = test;
          break;
        } catch (err: any) {
          lastError = err?.message || "signature mismatch";
        }
      }
      if (!verified) {
        console.error(
          `Webhook signature verification failed against ${allSecrets.length} secret(s):`,
          lastError
        );
        return NextResponse.json(
          { error: `Webhook signature verification failed: ${lastError}` },
          { status: 400 }
        );
      }
      if (!testSecretEventAllowed(viaTestSecret, verified.livemode)) {
        // A live event signed with the test endpoint's secret is never trusted.
        console.error("[webhook] refused: live event verified only by the test webhook secret", verified.id);
        return NextResponse.json({ error: "Test webhook secret only verifies test-mode events" }, { status: 400 });
      }
      event = verified;
    } else if (mayAcceptUnsignedEvent()) {
      // Local development only. Production refuses an unsigned event.
      console.warn("Webhook signature verification skipped (no STRIPE_WEBHOOK_SECRET, not production)");
      event = JSON.parse(body) as Stripe.Event;
    } else {
      console.error("[webhook] No signing secret configured in production; event refused");
      return NextResponse.json({ error: "Webhook signing secret is not configured" }, { status: 500 });
    }

    // b80 CR-6b: a test-mode event for anyone but an allow-listed test account is acknowledged and ignored.
    if (event.livemode === false) {
      const obj = (event.data?.object || {}) as { metadata?: Record<string, string> | null; client_reference_id?: string | null; customer?: unknown };
      const customerId = typeof obj.customer === "string" ? obj.customer : (obj.customer as { id?: string } | null)?.id ?? null;
      const testUserId = userIdFromEventObject(obj) || (await findUserIdByCustomer(customerId));
      if (!testEventUserAllowed(false, testUserId)) {
        console.warn("[webhook] ignored: test-mode event for a non-test account", event.id);
        return NextResponse.json({ received: true, ignored: "test_mode_not_allowed" });
      }
    }

    if (event.id && alreadyProcessed(event.id)) {
      return NextResponse.json({ received: true, duplicate: true });
    }

    // Handle the event
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;

      case "customer.subscription.created":
        await handleSubscriptionCreated(event.data.object as Stripe.Subscription);
        break;

      case "customer.subscription.updated":
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;

      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;

      case "payment_intent.succeeded":
        await handlePaymentIntentSucceeded(event.data.object as Stripe.PaymentIntent);
        break;

      case "payment_intent.payment_failed":
        await handlePaymentIntentFailed(event.data.object as Stripe.PaymentIntent);
        break;

      case "invoice.paid":
        await handleInvoicePaid(event.data.object as Stripe.Invoice);
        break;

      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    if (event.id) markProcessed(event.id);
    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error("[WEBHOOK ERROR]", err);
    return NextResponse.json(
      { error: "Webhook handler failed" },
      { status: 500 }
    );
  }
}
