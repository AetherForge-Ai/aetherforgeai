import { NextResponse } from "next/server";
import { stripe, APP_URL } from "@/lib/stripe";
import { getCurrentUser } from "@/lib/session";

/**
 * POST /api/stripe/portal
 * Opens the Stripe Customer Portal for the logged-in user to manage billing,
 * update payment methods, and cancel/upgrade their subscription.
 */
export async function POST() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    if (!user.stripe_customer_id) {
      return NextResponse.json(
        { ok: false, error: "No billing account found. Subscribe to a plan first." },
        { status: 400 }
      );
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripe_customer_id,
      return_url: `${APP_URL}/settings`,
    });

    return NextResponse.json({ ok: true, data: { url: session.url } });
  } catch (err: any) {
    console.error("[api/stripe/portal] error:", err);
    return NextResponse.json({ ok: false, error: err?.message || "Failed to open billing portal" }, { status: 500 });
  }
}
