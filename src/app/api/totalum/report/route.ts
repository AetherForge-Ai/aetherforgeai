import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { loadTotalumSynthesis } from "@/lib/totalum-service";
import { isTotalumEntitled } from "../route";
import { renderTotalumReport } from "@/lib/totalum-report-html";
import { buildStrategy, type GoalKey } from "@/lib/totalum-engine";
import { createZenithCompletion, isZenithConfigured } from "@/lib/grok";
import { ZENITH_STATE_LABEL } from "@/lib/zenith";

export const dynamic = "force-dynamic";

const GOALS: GoalKey[] = [
  "aggressive_growth",
  "balanced_growth",
  "income_growth",
  "capital_preservation",
  "preservation_crypto",
];

// GET /api/totalum/report?goal=balanced_growth — downloadable HTML intelligence report
export async function GET(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    if (!isTotalumEntitled(user)) {
      return NextResponse.json(
        { ok: false, error: "Totalum is a Pro feature for active paying members." },
        { status: 403 }
      );
    }

    const url = new URL(req.url);
    const goalParam = url.searchParams.get("goal");
    const goal = (GOALS.includes(goalParam as GoalKey) ? goalParam : "balanced_growth") as GoalKey;

    const synthesis = await loadTotalumSynthesis(user._id);
    const strategy = synthesis.isEmpty ? null : buildStrategy(synthesis, goal);

    // ZENITH State cross-asset briefing from the Totalum Master Architect (non-fatal).
    let aiNarrative: string | undefined;
    if (!synthesis.isEmpty && isZenithConfigured()) {
      try {
        const alloc = synthesis.classAllocation
          .map((c) => `${c.label} ${c.weight.toFixed(1)}% (${c.positions} pos)`)
          .join(", ");
        console.log(`[api/totalum/report] Running ${ZENITH_STATE_LABEL} briefing for user ${user._id}`);
        aiNarrative = await createZenithCompletion({
          maxTokens: 900,
          messages: [
            {
              role: "user",
              content:
                `You are Totalum, the cross-asset Master Portfolio Architect, briefing this member in ULTRA ADVANCED ZENITH STATE. ` +
                `Write a decisive 4-6 sentence executive briefing on the whole portfolio's posture and the single most important rebalancing move. ` +
                `Reference diversification, concentration and the chosen goal. Use **bold** for the highest-signal phrases.\n\n` +
                `Total wealth: NZ$${Math.round(synthesis.totalValueNZD).toLocaleString()}. Unrealised P/L: NZ$${Math.round(synthesis.totalGainNZD).toLocaleString()}.\n` +
                `Diversification: ${synthesis.diversificationScore}/100. Concentration: ${synthesis.concentrationLabel} (HHI ${synthesis.hhi}).\n` +
                `Expected annual return/vol: ${synthesis.expectedAnnualReturnPct}% / ${synthesis.expectedAnnualVolPct}%.\n` +
                `Allocation: ${alloc}.\n` +
                `Selected goal: ${goal.replace(/_/g, " ")}${strategy ? ` → recommended strategy "${strategy.name}" (${strategy.projectedReturnPct}% return @ ${strategy.projectedVolPct}% vol)` : ""}.\n\n` +
                `Write the ZENITH briefing now.`,
            },
          ],
        });
      } catch (grokErr) {
        console.error("[api/totalum/report] ZENITH briefing failed (non-fatal):", grokErr);
      }
    }

    const html = renderTotalumReport(synthesis, {
      memberName: user.name,
      strategy,
      aiNarrative,
      engine: ZENITH_STATE_LABEL,
    });

    console.log(`[api/totalum/report] Rendered intelligence report for user ${user._id} (goal=${goal})`);
    return new NextResponse(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `inline; filename="totalum-intelligence-report.html"`,
      },
    });
  } catch (err: any) {
    console.error("[api/totalum/report] error:", err);
    return NextResponse.json({ ok: false, error: err?.message || "Failed to render report" }, { status: 500 });
  }
}
