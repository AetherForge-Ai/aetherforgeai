import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  // Keep your current API version if you have one set
});

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

export async function POST(req: NextRequest) {
  // CRITICAL: Must use .text() to get the raw body
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json(
      { error: "Missing stripe-signature header" },
      { status: 400 }
    );
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err: any) {
    console.error("Webhook signature verification failed:", err.message);
    return NextResponse.json(
      { error: `Webhook signature verification failed: ${err.message}` },
      { status: 400 }
    );
  }

  // Handle the events you care about
  try {
    switch (event.type) {
      case "checkout.session.completed":
        // TODO: Grant access / fulfill order here
        console.log("Checkout session completed:", event.data.object.id);
        break;

      case "invoice.paid":
        // TODO: Update subscription status
        console.log("Invoice paid:", event.data.object.id);
        break;

      case "customer.subscription.created":
      case "customer.subscription.updated":
        // TODO: Update user subscription status in your database
        console.log("Subscription event:", event.type, event.data.object.id);
        break;

      case "payment_intent.succeeded":
        console.log("Payment succeeded:", event.data.object.id);
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }
  } catch (handlerError) {
    console.error("Error while handling event:", handlerError);
    // Still return 200 so Stripe stops retrying
  }

  return NextResponse.json({ received: true }, { status: 200 });
}