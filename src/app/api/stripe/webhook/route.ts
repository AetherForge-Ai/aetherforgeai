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
import { stripe, STRIPE_WEBHOOK_SECRETS, cryptoProvider } from "@/lib/stripe";
import Stripe from "stripe";
import { totalumSdk } from "@/lib/totalum";
import { planByPriceId, planByKey, parsePaymentLinkRef } from "@/lib/plans";

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

/** Map a Stripe subscription status to our app status. */
function mapStatus(status: Stripe.Subscription.Status): "active" | "past_due" | "canceled" | "none" {
  if (status === "active" || status === "trialing") return "active";
  if (status === "past_due" || status === "unpaid") return "past_due";
  if (status === "canceled" || status === "incomplete_expired") return "canceled";
  return "none";
}

/** Resolve our internal user _id from a Stripe customer id. */
async function findUserIdByCustomer(customerId: string | null): Promise<string | null> {
  if (!customerId) return null;
  try {
    const res = await totalumSdk.crud.query("user", {
      _filter: { stripe_customer_id: customerId },
      _limit: 1,
    });
    const rows = (res?.data as any[]) || [];
    return rows[0]?._id ?? null;
  } catch (err) {
    console.error("[webhook] findUserIdByCustomer error:", err);
    return null;
  }
}

async function updateUserSubscription(userId: string, patch: SubscriptionPatch) {
  try {
    await totalumSdk.crud.editRecordById("user", userId, patch);
    console.log(`[webhook] Updated user ${userId} subscription:`, patch);
  } catch (err) {
    console.error(`[webhook] Failed to update user ${userId}:`, err);
    throw err;
  }
}

async function syncSubscription(
  subscription: Stripe.Subscription,
  overrides?: { userId?: string | null; botAccess?: "stock" | "crypto" | null }
) {
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id;
  // Resolution order: explicit override (Payment Link client_reference_id) →
  // subscription metadata (dynamic Checkout Session) → customer lookup.
  const userId =
    overrides?.userId ||
    (subscription.metadata?.userId as string) ||
    (await findUserIdByCustomer(customerId));
  if (!userId) {
    console.warn("[webhook] No user found for subscription", subscription.id);
    return;
  }

  // Resolve the app plan from the purchased price id (authoritative — works for
  // Payment Links too), falling back to the plan key in metadata.
  const priceId = subscription.items?.data?.[0]?.price?.id;
  const planDef = planByPriceId(priceId) || planByKey(subscription.metadata?.plan as string);
  const active = mapStatus(subscription.status) === "active";

  // Prefer real Stripe billing-period bounds; fall back to plan durationDays.
  const sub = subscription as unknown as { current_period_start?: number; current_period_end?: number };
  const item0 = subscription.items?.data?.[0] as unknown as { current_period_start?: number; current_period_end?: number } | undefined;
  const startUnix = sub.current_period_start ?? item0?.current_period_start;
  const endUnix = sub.current_period_end ?? item0?.current_period_end;

  const startedAt = unixToIso(startUnix) ?? new Date().toISOString();
  const expiresAt =
    unixToIso(endUnix) ??
    (planDef ? new Date(Date.now() + planDef.durationDays * 86400_000).toISOString() : undefined);

  // Bot access: "both"-plans always unlock both bots. For single-bot plans,
  // prefer the explicit override (Payment Link bot hint) → subscription
  // metadata → default to stock.
  const botAccess =
    planDef?.botAccess === "both"
      ? "both"
      : overrides?.botAccess || (subscription.metadata?.bot_access as string) || "stock";
  const tickerLimit = Number(subscription.metadata?.ticker_limit) || planDef?.tickerLimit;

  const patch: SubscriptionPatch = {
    subscription_status: mapStatus(subscription.status),
    subscription_plan: active ? planDef?.key ?? "none" : "none",
    ...(customerId ? { stripe_customer_id: customerId } : {}),
  };

  if (active) {
    patch.subscription_started_at = startedAt;
    if (expiresAt) patch.subscription_expires_at = expiresAt;
    patch.bot_access = botAccess;
    if (tickerLimit) patch.ticker_limit = tickerLimit;
  } else {
    patch.bot_access = "none";
  }

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
      let subscription = await stripe.subscriptions.retrieve(subId);

      // Payment Links create a subscription WITHOUT our identity metadata (the
      // user only rides along on the session's client_reference_id). Stamp it
      // onto the subscription now so every future lifecycle event — renewals,
      // cancellations, failed payments — can resolve the user + entitlements
      // directly from subscription.metadata, exactly like a dynamic Checkout.
      if (userId && !subscription.metadata?.userId) {
        const priceId = subscription.items?.data?.[0]?.price?.id;
        const planDef = planByPriceId(priceId);
        const botAccess =
          planDef?.botAccess === "both" ? "both" : ref.bot || (subscription.metadata?.bot_access as string) || "stock";
        const stamped: Record<string, string> = {
          userId,
          plan: planDef?.key ?? (subscription.metadata?.plan as string) ?? "",
          ticker_limit: planDef ? String(planDef.tickerLimit) : (subscription.metadata?.ticker_limit as string) ?? "",
          bot_access: botAccess,
        };
        try {
          subscription = await stripe.subscriptions.update(subId, { metadata: stamped });
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

  // Fallback: at least mark active if we have a user
  if (userId) {
    const planDef = planByKey(session.metadata?.plan as string);
    await updateUserSubscription(userId, {
      subscription_status: "active",
      subscription_plan: planDef?.key ?? "monthly",
      subscription_started_at: new Date().toISOString(),
      ...(planDef
        ? {
            subscription_expires_at: new Date(Date.now() + planDef.durationDays * 86400_000).toISOString(),
            ticker_limit: Number(session.metadata?.ticker_limit) || planDef.tickerLimit,
            bot_access: (session.metadata?.bot_access as string) || (planDef.botAccess === "both" ? "both" : "stock"),
          }
        : {}),
      ...(customerId ? { stripe_customer_id: customerId } : {}),
    });
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
    await updateUserSubscription(userId, {
      subscription_status: "canceled",
      subscription_plan: "none",
      bot_access: "none",
    });
  }
}

async function handlePaymentIntentSucceeded(paymentIntent: Stripe.PaymentIntent) {
  console.log("Payment intent succeeded:", paymentIntent.id);
  // TODO: Store payment in your database using TotalumSDK
}

async function handlePaymentIntentFailed(paymentIntent: Stripe.PaymentIntent) {
  console.log("Payment intent failed:", paymentIntent.id);
  // TODO: Store failed payment in your database using TotalumSDK
}

async function handleInvoicePaid(invoice: Stripe.Invoice) {
  console.log("Invoice paid:", invoice.id);
  // TODO: Update invoice status in your database
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  console.log("Invoice payment failed:", invoice.id);
  // TODO: Handle failed invoice payment
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
    if (STRIPE_WEBHOOK_SECRETS.length) {
      let verified: Stripe.Event | null = null;
      let lastError = "";
      for (const secret of STRIPE_WEBHOOK_SECRETS) {
        try {
          verified = await stripe.webhooks.constructEventAsync(
            body,
            signature,
            secret,
            undefined,
            cryptoProvider
          );
          break;
        } catch (err: any) {
          lastError = err?.message || "signature mismatch";
        }
      }
      if (!verified) {
        console.error(
          `Webhook signature verification failed against ${STRIPE_WEBHOOK_SECRETS.length} secret(s):`,
          lastError
        );
        return NextResponse.json(
          { error: `Webhook signature verification failed: ${lastError}` },
          { status: 400 }
        );
      }
      event = verified;
    } else {
      // For development without webhook secret
      console.warn("⚠️  Webhook signature verification skipped (no STRIPE_WEBHOOK_SECRET)");
      event = JSON.parse(body) as Stripe.Event;
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

    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error("[WEBHOOK ERROR]", err);
    return NextResponse.json(
      { error: err.message || "Webhook handler failed" },
      { status: 500 }
    );
  }
}
