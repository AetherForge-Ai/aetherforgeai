import { NextResponse } from "next/server";
import { z } from "zod";
import { stripe } from "@/lib/stripe";
import { getCurrentUser } from "@/lib/session";
import { totalumSdk } from "@/lib/totalum";
import { planByPriceId, planByKey } from "@/lib/plans";

const schema = z.object({
  priceId: z.string().min(1, "Price ID is required"),
  plan: z.enum(["weekly", "monthly", "yearly", "dual_yearly"]).optional(),
  bot: z.enum(["stock", "crypto"]).optional(),
  // "now" applies the change immediately with prorated credit/charge;
  // "next_cycle" swaps the price at the next renewal with no proration.
  when: z.enum(["now", "next_cycle"]).optional(),
});

function serializeError(err: unknown) {
  const e = err as any;
  return { message: e?.message ?? "Unknown error", code: e?.code ?? null };
}

/**
 * POST /api/stripe/upgrade
 * Changes the logged-in user's ACTIVE subscription to a new plan with automatic
 * proration. Immediate upgrades bill the prorated difference now; "next_cycle"
 * defers the switch to renewal. The customer.subscription.updated webhook then
 * syncs plan/ticker_limit/bot_access back to the user record — but we also patch
 * eagerly so the dashboard reflects the new plan without waiting for the event.
 */
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const parsed = schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
    }
    const { priceId, bot, when = "now" } = parsed.data;

    const planDef = planByPriceId(priceId) || planByKey(parsed.data.plan);
    if (!planDef) {
      return NextResponse.json({ ok: false, error: "Unknown plan / price id" }, { status: 400 });
    }

    const customerId = user.stripe_customer_id;
    if (!customerId) {
      return NextResponse.json(
        { ok: false, error: "No billing account found. Start a subscription from the pricing page first." },
        { status: 400 }
      );
    }

    // Find the customer's current active subscription.
    const subs = await stripe.subscriptions.list({ customer: customerId, status: "active", limit: 1 });
    const current = subs.data[0];
    if (!current) {
      return NextResponse.json(
        { ok: false, error: "No active subscription to upgrade. Please subscribe from the pricing page." },
        { status: 400 }
      );
    }

    const itemId = current.items.data[0]?.id;
    if (!itemId) {
      return NextResponse.json({ ok: false, error: "Subscription has no billable item." }, { status: 400 });
    }

    // Already on this exact price? No-op.
    if (current.items.data[0]?.price?.id === priceId) {
      return NextResponse.json({ ok: false, error: "You are already on this plan." }, { status: 400 });
    }

    const botAccess = planDef.botAccess === "both" ? "both" : bot === "crypto" ? "crypto" : "stock";
    const meta = {
      userId: user._id,
      plan: planDef.key,
      ticker_limit: String(planDef.tickerLimit),
      bot_access: botAccess,
    };

    console.log(
      `[api/stripe/upgrade] Switching sub ${current.id} → ${planDef.key} (${priceId}) for user ${user._id} [${when}]`
    );

    const updated = await stripe.subscriptions.update(current.id, {
      items: [{ id: itemId, price: priceId }],
      // Immediate upgrade → prorate now; deferred → no proration, swap at renewal.
      proration_behavior: when === "now" ? "create_prorations" : "none",
      // Keep the same renewal date so proration is calculated against it.
      billing_cycle_anchor: "unchanged",
      // Pay any prorated amount off the default payment method automatically.
      payment_behavior: "allow_incomplete",
      metadata: meta,
    });

    // Eagerly reflect the new entitlement so the UI updates immediately.
    // The webhook remains the source of truth for billing-period bounds.
    try {
      await totalumSdk.crud.editRecordById("user", user._id, {
        subscription_plan: planDef.key,
        subscription_status: "active",
        ticker_limit: planDef.tickerLimit,
        bot_access: botAccess,
      });
    } catch (patchErr) {
      console.error("[api/stripe/upgrade] Eager user patch failed (webhook will reconcile):", patchErr);
    }

    return NextResponse.json({
      ok: true,
      data: {
        subscriptionId: updated.id,
        plan: planDef.key,
        botAccess,
        tickerLimit: planDef.tickerLimit,
        proration: when === "now",
      },
    });
  } catch (err) {
    console.error("[api/stripe/upgrade] error:", err);
    return NextResponse.json({ ok: false, error: serializeError(err) }, { status: 500 });
  }
}
