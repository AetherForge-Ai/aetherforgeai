import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { loadTotalumSynthesis, loadReportFindings } from "@/lib/totalum-service";
import { isTotalumEntitled } from "../route";
import { renderTotalumReport } from "@/lib/totalum-report-html";
import { buildStrategy, type GoalKey } from "@/lib/totalum-engine";
import { createZenithCompletion, isZenithConfigured } from "@/lib/grok";
import { ZENITH_STATE_LABEL } from "@/lib/zenith";
import {
  alignNarrativeToPlan,
  intelligenceBriefInstructions,
  sanitizeHeadmasterReportHtml,
  scopeHeadmasterIdeas,
} from "@/lib/headmaster-trust";

export const dynamic = "force-dynamic";

const GOALS: GoalKey[] = [
  "aggressive_growth",
  "balanced_growth",
  "income_growth",
  "capital_preservation",
  "preservation_crypto",
  "conservative_growth",
  "high_risk_high_reward",
];

// GET /api/totalum/report?goal=balanced_growth — downloadable HTML intelligence report
export async function GET(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    if (!isTotalumEntitled(user)) {
      return NextResponse.json(
        { ok: false, error: "The Headmaster is a Pro feature for active paying members." },
        { status: 403 }
      );
    }

    const url = new URL(req.url);
    const goalParam = url.searchParams.get("goal");
    const goal = (GOALS.includes(goalParam as GoalKey) ? goalParam : "balanced_growth") as GoalKey;
    const includeWatchlist = url.searchParams.get("watchlist") === "1";

    const [synthesis, findings] = await Promise.all([
      loadTotalumSynthesis(user._id),
      loadReportFindings(user._id),
    ]);
    const strategy = synthesis.isEmpty ? null : buildStrategy(synthesis, goal);
    const heldTickers = synthesis.positions
      .filter((p) => p.assetClass !== "cash")
      .map((p) => p.label);
    const scoped = scopeHeadmasterIdeas(findings.ideas || [], heldTickers, includeWatchlist);

    // Additional commentary only. Cash figures and the executive brief come from strategy.plan.
    let aiNarrative: string | undefined;
    if (!synthesis.isEmpty && strategy && isZenithConfigured()) {
      try {
        const alloc = synthesis.classAllocation
          .map((c) => `${c.label} ${c.weight.toFixed(1)}% (${c.positions} pos)`)
          .join(", ");
        console.log(`[api/totalum/report] Running ${ZENITH_STATE_LABEL} commentary for user ${user._id} watchlist=${includeWatchlist}`);
        aiNarrative = await createZenithCompletion({
          maxTokens: 1000,
          messages: [
            {
              role: "user",
              content:
                intelligenceBriefInstructions({
                  plan: strategy.plan,
                  heldTickers,
                  includeWatchlist,
                  findingsContext: scoped.contextBlock,
                }) +
                `\n\nBook facts: total ${Math.round(synthesis.totalValueNZD)}. Diversification ${synthesis.diversificationScore}/100 (${synthesis.concentrationLabel}, HHI ${synthesis.hhi}). ` +
                `Current model return/vol ${synthesis.expectedAnnualReturnPct}% / ${synthesis.expectedAnnualVolPct}%. Allocation: ${alloc}. ` +
                `Selected skeleton: ${strategy.name}.`,
            },
          ],
        });
        aiNarrative = alignNarrativeToPlan(aiNarrative, strategy.plan);
      } catch (grokErr) {
        console.error("[api/totalum/report] ZENITH briefing failed (non-fatal):", grokErr);
      }
    }

    const html = sanitizeHeadmasterReportHtml(
      renderTotalumReport(synthesis, {
        memberName: user.name,
        strategy,
        aiNarrative,
        engine: ZENITH_STATE_LABEL,
        watchlist: includeWatchlist ? scoped.watchlist : [],
      }),
      strategy?.plan
    );

    console.log(`[api/totalum/report] Rendered intelligence report for user ${user._id} (goal=${goal})`);
    return new NextResponse(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `inline; filename="headmaster-intelligence-report.html"`,
        "Cache-Control": "private, no-store, no-cache, must-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      },
    });
  } catch (err: any) {
    console.error("[api/totalum/report] error:", err);
    return NextResponse.json({ ok: false, error: err?.message || "Failed to render report" }, { status: 500 });
  }
}
