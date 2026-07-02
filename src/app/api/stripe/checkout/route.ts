import { NextResponse } from "next/server";
import { z } from "zod";
import { stripe, getRequestBaseUrl } from "@/lib/stripe";
import { getCurrentUser } from "@/lib/session";
import { totalumSdk } from "@/lib/totalum";
import { planByPriceId, planByKey } from "@/lib/plans";

const schema = z.object({
  priceId: z.string().min(1, "Price ID is required"),
  plan: z.enum(["weekly", "monthly", "yearly", "dual_yearly"]).optional(),
  // Which bot the buyer wants for a single-bot plan. Ignored for "both" plans.
  bot: z.enum(["stock", "crypto"]).optional(),
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
    const { priceId, bot } = parsed.data;

    // Resolve the plan from the price id (authoritative) or the passed key.
    const planDef = planByPriceId(priceId) || planByKey(parsed.data.plan);
    if (!planDef) {
      return NextResponse.json({ ok: false, error: "Unknown plan / price id" }, { status: 400 });
    }

    // For single-bot plans a bot choice is required; dual plans unlock both.
    const botAccess = planDef.botAccess === "both" ? "both" : bot === "crypto" ? "crypto" : "stock";
    const meta = {
      userId: user._id,
      plan: planDef.key,
      ticker_limit: String(planDef.tickerLimit),
      bot_access: botAccess,
    };

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

    const baseUrl = getRequestBaseUrl(req);
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: user._id,
      metadata: meta,
      subscription_data: { metadata: meta },
      success_url: `${baseUrl}/stripe/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/pricing`,
      allow_promotion_codes: true,
    });

    return NextResponse.json({ ok: true, data: { url: session.url, sessionId: session.id } });
  } catch (err) {
    console.error("[api/stripe/checkout] error:", err);
    return NextResponse.json({ ok: false, error: serializeError(err) }, { status: 500 });
  }
}
