import { NextResponse } from "next/server";
import { z } from "zod";
import { stripe, getRequestBaseUrl, redactStripeMessage } from "@/lib/stripe";
import { getCurrentUser } from "@/lib/session";
import { totalumSdk } from "@/lib/totalum";
import { isSelfServeCheckoutPlan, planByPriceId, planByKey } from "@/lib/plans";
import { ensurePublicPrice } from "@/lib/ensure-public-price";
import { publicPriceSlot } from "@/lib/public-catalog";

const schema = z
  .object({
    priceId: z.string().optional(),
    plan: z
      .enum([
        "weekly",
        "monthly",
        "yearly",
        "dual_yearly",
        "starter_monthly",
        "starter_yearly",
        "pro_monthly",
        "pro_yearly",
      ])
      .optional(),
    // Which bot the buyer wants for a single-bot plan. Ignored for "both" plans.
    bot: z.enum(["stock", "crypto"]).optional(),
  })
  .refine((body) => Boolean(body.plan) || Boolean(body.priceId?.trim()), {
    message: "Plan is required",
  });

function serializeError(err: unknown) {
  const e = err as { message?: string; code?: string | null };
  return {
    message: redactStripeMessage(e?.message ?? "Unknown error"),
    code: e?.code ?? null,
  };
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
    const { bot } = parsed.data;
    const requestedKey = parsed.data.plan;
    const requestedPriceId = parsed.data.priceId?.trim() || "";

    // Starter and Pro ignore a client-supplied price id. The server attaches
    // the catalog Price (found or created from STRIPE_SECRET_KEY). Legacy Apex
    // still requires the committed price id.
    const planDef = (requestedKey ? planByKey(requestedKey) : undefined) || planByPriceId(requestedPriceId);
    if (!planDef) {
      return NextResponse.json({ ok: false, error: "Unknown plan / price id" }, { status: 400 });
    }
    const selfServe = isSelfServeCheckoutPlan(planDef);
    const legacyApex =
      planDef.key === "weekly" ||
      planDef.key === "monthly" ||
      planDef.key === "yearly" ||
      planDef.key === "dual_yearly";
    if (planDef.key.startsWith("ultimate_") || planDef.archived || (!selfServe && !legacyApex)) {
      return NextResponse.json(
        { ok: false, error: "This plan is not available for self-serve checkout." },
        { status: 400 }
      );
    }
    if (!selfServe && planDef.priceId !== requestedPriceId) {
      return NextResponse.json({ ok: false, error: "Unknown plan / price id" }, { status: 400 });
    }

    const slot = publicPriceSlot(planDef.key);
    const priceId = slot ? await ensurePublicPrice(slot.key) : planDef.priceId;

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

    // Starter and Pro use the catalog Price (immutable) and a 14-day trial.
    // A card is collected now. The trial does not convert without that card.
    // Ultimate is rejected above. Free activation never reaches this route.
    // Legacy Apex keeps its existing price and does not gain a trial.
    const subscriptionData: Record<string, unknown> = {
      metadata: meta,
      description: `${planDef.name} — AetherForge AI paper portfolio and research reports (NZD). Not a broker.`,
    };
    if (selfServe) subscriptionData.trial_period_days = 14;

    const baseUrl = getRequestBaseUrl(req);
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: user._id,
      metadata: meta,
      subscription_data: subscriptionData as any,
      payment_method_collection: "always",
      locale: "en",
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
