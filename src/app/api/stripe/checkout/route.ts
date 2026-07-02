import { NextResponse } from "next/server";
import { z } from "zod";
import { stripe, APP_URL } from "@/lib/stripe";
import { getCurrentUser } from "@/lib/session";
import { totalumSdk } from "@/lib/totalum";

const schema = z.object({
  priceId: z.string().min(1, "Price ID is required"),
  plan: z.enum(["monthly", "yearly"]).optional(),
});

function serializeError(err: unknown) {
  const e = err as any;
  return { message: e?.message ?? "Unknown error", code: e?.code ?? null };
}

/**
 * POST /api/stripe/checkout
 * Creates a subscription Checkout Session tied to the logged-in user.
 * Reuses (or lazily creates) the user's Stripe customer so billing history
 * stays attached to the same customer across renewals.
 */
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as unknown;
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
    }
    const { priceId, plan } = parsed.data;

    // Ensure a Stripe customer for this user
    let customerId = user.stripe_customer_id || undefined;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.name,
        metadata: { userId: user._id },
      });
      customerId = customer.id;
      await totalumSdk.crud.editRecordById("user", user._id, { stripe_customer_id: customerId });
      console.log(`[api/stripe/checkout] Created Stripe customer ${customerId} for user ${user._id}`);
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: user._id,
      metadata: { userId: user._id, plan: plan || "monthly" },
      subscription_data: { metadata: { userId: user._id, plan: plan || "monthly" } },
      success_url: `${APP_URL}/stripe/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${APP_URL}/pricing`,
      allow_promotion_codes: true,
    });

    return NextResponse.json({ ok: true, data: { url: session.url, sessionId: session.id } });
  } catch (err) {
    console.error("[api/stripe/checkout] error:", err);
    return NextResponse.json({ ok: false, error: serializeError(err) }, { status: 500 });
  }
}
