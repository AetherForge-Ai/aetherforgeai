import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser, isStripeConfigured, type AppUser } from "@/lib/session";
import { loadReportFindings, loadTotalumSynthesis, type ReportFindings } from "@/lib/totalum-service";
import { buildStrategy, sleeveNotesForSynthesis, type GoalKey } from "@/lib/totalum-engine";
import type { SleevePickSource } from "@/lib/sleeve-fill";
import { headmasterDepth, type HeadmasterDepth } from "@/lib/entitlements";
import type { TotalumSynthesis } from "@/lib/totalum-engine";

export const dynamic = "force-dynamic";

/**
 * Headmaster depth for this member.
 * Demo mode (no Stripe key) stays open so local testing is not locked out.
 * In production, Free has no plan, Starter is basic, and Pro and above are full.
 */
export function headmasterAccess(user: AppUser | null): HeadmasterDepth {
  if (!user) return "none";
  if (!isStripeConfigured()) return "full";
  return headmasterDepth(user.subscription_plan);
}

/** Basic or full desk. Free is refused when Stripe is configured. */
export function isTotalumEntitled(user: AppUser | null): boolean {
  return headmasterAccess(user) !== "none";
}

/** Stress tests, the intelligence report, and the strategist. */
export function isFullHeadmaster(user: AppUser | null): boolean {
  return headmasterAccess(user) === "full";
}

function presentSynthesis(synthesis: TotalumSynthesis, depth: HeadmasterDepth): TotalumSynthesis {
  if (depth === "full") return synthesis;
  return { ...synthesis, stressTests: [] };
}

const GOALS: [GoalKey, ...GoalKey[]] = [
  "aggressive_growth",
  "balanced_growth",
  "income_growth",
  "capital_preservation",
  "preservation_crypto",
  "conservative_growth",
  "high_risk_high_reward",
];

function picksFromFindings(findings: ReportFindings): SleevePickSource | undefined {
  if (!findings.hasStox && !findings.hasKoins) return undefined;
  return {
    equitiesQualifying: findings.equitiesQualifying,
    cryptoQualifying: findings.cryptoQualifying,
    equitiesNotSized: findings.equitiesNotSized,
    cryptoNotSized: findings.cryptoNotSized,
  };
}

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
        { ok: false, error: "The Headmaster plan is included on Starter and above.", data: { code: "not_entitled" } },
        { status: 403 }
      );
    }

    const depth = headmasterAccess(user);
    const [rawSynthesis, findings] = await Promise.all([
      loadTotalumSynthesis(user._id),
      loadReportFindings(user._id),
    ]);
    const synthesis = presentSynthesis(
      {
        ...rawSynthesis,
        sleeveNotes: sleeveNotesForSynthesis(rawSynthesis, picksFromFindings(findings)),
      },
      depth
    );
    return NextResponse.json({ ok: true, data: { synthesis, depth } });
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
        { ok: false, error: "The Headmaster plan is included on Starter and above.", data: { code: "not_entitled" } },
        { status: 403 }
      );
    }

    const body = (await req.json().catch(() => ({}))) as unknown;
    const parsed = postSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
    }

    const depth = headmasterAccess(user);
    const [rawSynthesis, findings] = await Promise.all([
      loadTotalumSynthesis(user._id),
      loadReportFindings(user._id),
    ]);
    const synthesis = presentSynthesis(
      {
        ...rawSynthesis,
        sleeveNotes: sleeveNotesForSynthesis(rawSynthesis, picksFromFindings(findings)),
      },
      depth
    );
    const goal: GoalKey = parsed.data.goal ?? "balanced_growth";
    const picks = picksFromFindings(findings);
    // Cash-only / any funded book builds a strategy; truly empty books return null.
    const strategy = synthesis.isEmpty ? null : buildStrategy(synthesis, goal, picks);

    console.log(`[api/totalum] POST built strategy '${goal}' for user ${user._id} (empty=${synthesis.isEmpty}, cash=${synthesis.cashBalanceNZD})`);
    return NextResponse.json({ ok: true, data: { synthesis, strategy } });
  } catch (err: any) {
    console.error("[api/totalum] POST error:", err);
    return NextResponse.json({ ok: false, error: err?.message || "Failed to build strategy" }, { status: 500 });
  }
}
