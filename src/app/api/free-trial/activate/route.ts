import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
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
export async function POST() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "You must be signed in to start the free trial." }, { status: 401 });
    }

    // Never clobber an active PAID subscription with the free tier.
    const paidPlans = ["weekly", "monthly", "yearly", "dual_yearly"];
    if (user.subscription_status === "active" && paidPlans.includes(user.subscription_plan || "")) {
      console.log(`[free-trial] User ${user._id} already on paid plan ${user.subscription_plan}; skipping free activation`);
      return NextResponse.json({ ok: true, data: { plan: user.subscription_plan, alreadyPaid: true } });
    }

    const now = new Date();
    const expires = new Date(now.getTime() + FREE_PLAN.durationDays * 86400_000);

    const patch = {
      subscription_status: "active",
      subscription_plan: "free",
      bot_access: FREE_PLAN.botAccess, // "both"
      ticker_limit: FREE_PLAN.tickerLimit, // 3
      subscription_started_at: now.toISOString(),
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
