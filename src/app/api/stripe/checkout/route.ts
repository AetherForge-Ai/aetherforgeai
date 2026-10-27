import { NextResponse } from "next/server";
import { z } from "zod";
import { getRequestBaseUrl, redactStripeMessage } from "@/lib/stripe";
import { createPlanCheckout } from "@/lib/stripe-checkout";
import { getCurrentUser } from "@/lib/session";
import { isSelfServeCheckoutPlan, planByPriceId, planByKey } from "@/lib/plans";

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

    // Goal b11 CR-1: test mode unless STRIPE_CHECKOUT_MODE=live (see stripe-mode.ts).
    const result = await createPlanCheckout({ user, plan: planDef, bot, baseUrl: getRequestBaseUrl(req) });
    if ("error" in result) return NextResponse.json({ ok: false, error: result.error, ...(result.portalUrl ? { data: { portalUrl: result.portalUrl } } : {}) }, { status: result.status });
    return NextResponse.json({ ok: true, data: result.data });
  } catch (err) {
    console.error("[api/stripe/checkout] error:", err);
    return NextResponse.json({ ok: false, error: serializeError(err) }, { status: 500 });
  }
}
