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
import { stripe, STRIPE_WEBHOOK_SECRET, cryptoProvider } from "@/lib/stripe";
import Stripe from "stripe";
import { totalumSdk } from "@/lib/totalum";

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

async function updateUserSubscription(
  userId: string,
  patch: { subscription_status?: string; subscription_plan?: string; stripe_customer_id?: string }
) {
  try {
    await totalumSdk.crud.editRecordById("user", userId, patch);
    console.log(`[webhook] Updated user ${userId} subscription:`, patch);
  } catch (err) {
    console.error(`[webhook] Failed to update user ${userId}:`, err);
    throw err;
  }
}

async function syncSubscription(subscription: Stripe.Subscription) {
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id;
  const userId = (subscription.metadata?.userId as string) || (await findUserIdByCustomer(customerId));
  if (!userId) {
    console.warn("[webhook] No user found for subscription", subscription.id);
    return;
  }

  const interval = subscription.items?.data?.[0]?.price?.recurring?.interval;
  const plan = interval === "year" ? "yearly" : interval === "month" ? "monthly" : (subscription.metadata?.plan as string) || "monthly";

  await updateUserSubscription(userId, {
    subscription_status: mapStatus(subscription.status),
    subscription_plan: mapStatus(subscription.status) === "active" ? plan : "none",
    ...(customerId ? { stripe_customer_id: customerId } : {}),
  });
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  console.log("Checkout completed:", session.id);
  const userId = (session.metadata?.userId as string) || (session.client_reference_id as string) || null;
  const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;

  if (session.mode === "subscription" && session.subscription) {
    const subId = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
    try {
      const subscription = await stripe.subscriptions.retrieve(subId);
      await syncSubscription(subscription);
      return;
    } catch (err) {
      console.error("[webhook] Failed to retrieve subscription:", err);
    }
  }

  // Fallback: at least mark active if we have a user
  if (userId) {
    await updateUserSubscription(userId, {
      subscription_status: "active",
      subscription_plan: (session.metadata?.plan as string) || "monthly",
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
    await updateUserSubscription(userId, { subscription_status: "canceled", subscription_plan: "none" });
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

    // Verify webhook signature using async method for Cloudflare Workers compatibility
    if (STRIPE_WEBHOOK_SECRET) {
      try {
        event = await stripe.webhooks.constructEventAsync(
          body,
          signature,
          STRIPE_WEBHOOK_SECRET,
          undefined,
          cryptoProvider
        );
      } catch (err: any) {
        console.error("Webhook signature verification failed:", err.message);
        return NextResponse.json(
          { error: `Webhook signature verification failed: ${err.message}` },
          { status: 400 }
        );
      }
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
