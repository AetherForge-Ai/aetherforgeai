import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser, isStripeConfigured, hasPaidSubscription, type AppUser } from "@/lib/session";
import { loadTotalumSynthesis } from "@/lib/totalum-service";
import { buildStrategy, type GoalKey } from "@/lib/totalum-engine";

export const dynamic = "force-dynamic";

/**
 * Totalum is a PRO feature — the master architect that unifies Stox + Koins +
 * metals. It's reserved for active paying members (upsell path for everyone
 * else). In demo mode (no Stripe key) it's open so testers aren't locked out.
 */
export function isTotalumEntitled(user: AppUser | null): boolean {
  if (!user) return false;
  if (!isStripeConfigured()) return true; // demo mode
  return hasPaidSubscription(user);
}

const GOALS: [GoalKey, ...GoalKey[]] = [
  "aggressive_growth",
  "balanced_growth",
  "income_growth",
  "capital_preservation",
  "preservation_crypto",
];

const postSchema = z.object({
  goal: z.enum(GOALS).optional(),
});

// GET /api/totalum — full cross-asset synthesis for the current user
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    if (!isTotalumEntitled(user)) {
      console.log(`[api/totalum] GET blocked — user ${user._id} is not a Pro member`);
      return NextResponse.json(
        { ok: false, error: "Totalum is a Pro feature for active paying members.", data: { code: "not_entitled" } },
        { status: 403 }
      );
    }

    const synthesis = await loadTotalumSynthesis(user._id);
    return NextResponse.json({ ok: true, data: { synthesis } });
  } catch (err: any) {
    console.error("[api/totalum] GET error:", err);
    return NextResponse.json({ ok: false, error: err?.message || "Failed to synthesise portfolio" }, { status: 500 });
  }
}

// POST /api/totalum — synthesis + a concrete strategy blueprint for a goal
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    if (!isTotalumEntitled(user)) {
      return NextResponse.json(
        { ok: false, error: "Totalum is a Pro feature for active paying members.", data: { code: "not_entitled" } },
        { status: 403 }
      );
    }

    const body = (await req.json().catch(() => ({}))) as unknown;
    const parsed = postSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
    }

    const synthesis = await loadTotalumSynthesis(user._id);
    const goal: GoalKey = parsed.data.goal ?? "balanced_growth";
    const strategy = buildStrategy(synthesis, goal);

    console.log(`[api/totalum] POST built strategy '${goal}' for user ${user._id}`);
    return NextResponse.json({ ok: true, data: { synthesis, strategy } });
  } catch (err: any) {
    console.error("[api/totalum] POST error:", err);
    return NextResponse.json({ ok: false, error: err?.message || "Failed to build strategy" }, { status: 500 });
  }
}
