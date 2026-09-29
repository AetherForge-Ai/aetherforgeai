import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { isFreeReportPlan } from "@/lib/entitlements";
import { totalumSdk } from "@/lib/totalum";
import { FREE_PLAN } from "@/lib/plans";

/**
 * POST /api/free-trial/activate
 *
 * Instantly activates the free tier for the logged-in user. No Stripe involved —
 * the free plan carries no price id. We stamp the same subscription fields the
 * Stripe webhook writes so every gate (`hasActiveSubscription`, `bot_access`,
 * `ticker_limit`) treats a free member exactly like a paying one, just capped.
 *
 * Idempotent: calling it again on an already-active PAID plan is a no-op so we
 * never downgrade a paying customer who happens to hit the free CTA.
 */
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "You must be signed in to start the free trial." }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as { bot?: string };
    const chosen = body.bot === "crypto" ? "crypto" : body.bot === "stock" ? "stock" : null;
    if (!chosen) {
      return NextResponse.json(
        { ok: false, error: "Choose Stox (stock) or Koins (crypto) for the free plan." },
        { status: 400 }
      );
    }

    // Never clobber an active PAID subscription with the free tier.
    if (user.subscription_status === "active" && !isFreeReportPlan(user.subscription_plan)) {
      console.log(`[free-trial] User ${user._id} already on paid plan ${user.subscription_plan}; skipping free activation`);
      return NextResponse.json({ ok: true, data: { plan: user.subscription_plan, alreadyPaid: true } });
    }

    const now = new Date();
    const expires = new Date(now.getTime() + FREE_PLAN.durationDays * 86400_000);
    // Legacy free accounts that already have both bots keep them. A new choice
    // is Stox or Koins, matching the Pricing card.
    const current = user.bot_access ?? "none";
    const botAccess = current === "both" ? "both" : chosen;

    const patch = {
      subscription_status: "active",
      subscription_plan: "free",
      bot_access: botAccess,
      ticker_limit: FREE_PLAN.tickerLimit,
      subscription_started_at: user.subscription_started_at || now.toISOString(),
      subscription_expires_at: expires.toISOString(),
    };

    await totalumSdk.crud.editRecordById("user", user._id, patch);
    console.log(`[free-trial] Activated free plan for user ${user._id} (${user.email})`);

    return NextResponse.json({ ok: true, data: { plan: "free" } });
  } catch (err: any) {
    console.error("[free-trial] activate error:", err);
    return NextResponse.json({ ok: false, error: err?.message || "Could not activate the free trial." }, { status: 500 });
  }
}
