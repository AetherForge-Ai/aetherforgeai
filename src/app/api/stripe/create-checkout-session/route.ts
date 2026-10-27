/**
 * POST /api/stripe/create-checkout-session
 * Goal b11 CR-1: signed-in only (401 otherwise). Same server path as
 * /api/stripe/checkout: plan from the catalog, customer from the session user,
 * Stripe test mode unless STRIPE_CHECKOUT_MODE=live. In test mode the reply
 * echoes { testMode: true, priceId, unitAmount } (Starter monthly = 1600 NZD).
 * Body: { priceId?: string, plan?: PlanKey, bot?: "stock" | "crypto" }.
 * customerEmail / metadata / mode from the body are ignored.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/session";
import { getRequestBaseUrl, redactStripeMessage } from "@/lib/stripe";
import { isSelfServeCheckoutPlan, planByKey, planByPriceId, type PlanKey } from "@/lib/plans";
import { createPlanCheckout } from "@/lib/stripe-checkout";

const schema = z.object({
  priceId: z.string().optional(),
  plan: z.string().optional(),
  bot: z.enum(["stock", "crypto"]).optional(),
});

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Sign in to start checkout." }, { status: 401 });
  try {
    const parsed = schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
    const plan = (parsed.data.plan ? planByKey(parsed.data.plan as PlanKey) : undefined) || planByPriceId(parsed.data.priceId?.trim() || "");
    if (!plan || plan.archived || !isSelfServeCheckoutPlan(plan) || plan.key.startsWith("ultimate_")) {
      return NextResponse.json({ ok: false, error: "This plan is not available for self-serve checkout." }, { status: 400 });
    }
    const result = await createPlanCheckout({ user, plan, bot: parsed.data.bot, baseUrl: getRequestBaseUrl(req) });
    if ("error" in result) return NextResponse.json({ ok: false, error: result.error, ...(result.portalUrl ? { data: { portalUrl: result.portalUrl } } : {}) }, { status: result.status });
    return NextResponse.json({ ok: true, data: result.data });
  } catch (err) {
    const e = err as { message?: string };
    console.error("[api/stripe/create-checkout-session] error:", redactStripeMessage(e?.message || "unknown"));
    return NextResponse.json({ ok: false, error: "Checkout could not be started." }, { status: 500 });
  }
}
