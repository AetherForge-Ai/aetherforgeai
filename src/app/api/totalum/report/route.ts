import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { loadTotalumSynthesis, loadReportFindings } from "@/lib/totalum-service";
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

    const [synthesis, findings] = await Promise.all([
      loadTotalumSynthesis(user._id),
      loadReportFindings(user._id),
    ]);
    const strategy = synthesis.isEmpty ? null : buildStrategy(synthesis, goal);

    // ZENITH State cross-asset briefing from The Headmaster (non-fatal).
    let aiNarrative: string | undefined;
    if (!synthesis.isEmpty && isZenithConfigured()) {
      try {
        const alloc = synthesis.classAllocation
          .map((c) => `${c.label} ${c.weight.toFixed(1)}% (${c.positions} pos)`)
          .join(", ");
        const buyLines = findings.buys
          .slice()
          .sort((a, b) => b.projected7dPct - a.projected7dPct)
          .slice(0, 8)
          .map(
            (b) =>
              `- ${b.ticker} (${b.name}) [${b.market}] projected ${b.projected7dPct >= 0 ? "+" : ""}${b.projected7dPct}% 7d${
                b.reason ? ` — ${b.reason}` : ""
              }`
          )
          .join("\n");
        console.log(`[api/totalum/report] Running ${ZENITH_STATE_LABEL} briefing for user ${user._id}`);
        aiNarrative = await createZenithCompletion({
          maxTokens: 1000,
          messages: [
            {
              role: "user",
              content:
                `You are The Headmaster, the cross-asset Portfolio Planning and Strategies agent, briefing this member in ULTRA ADVANCED ZENITH STATE. ` +
                `Write a decisive 5-7 sentence executive briefing on the whole portfolio's posture and the single most important rebalancing move. ` +
                `Reference diversification, concentration and the chosen goal. Use **bold** for the highest-signal phrases.\n` +
                `You are given the LATEST FULL-REPORT FINDINGS from BOTH the Stox (NZX/ASX/NASDAQ/DOW equities) and Koins (complete crypto market) Full Reports — factor their projections and specific BUY calls into a more specific, in-depth plan.\n` +
                `MANDATORY: when you suggest BUYS, explicitly NAME the specific tickers/coins to buy with concrete reasoning and conviction drawn from the findings below. If cash is available, lead with a ticker-level BUY/ACCUMULATE deployment list — not class allocation alone. Never give vague or generic advice.\n\n` +
                `Total wealth: NZ$${Math.round(synthesis.totalValueNZD).toLocaleString()}. Cash: NZ$${Math.round(synthesis.cashBalanceNZD).toLocaleString()}. Unrealised P/L: NZ$${Math.round(synthesis.totalGainNZD).toLocaleString()}.\n` +
                `Diversification: ${synthesis.diversificationScore}/100. Concentration: ${synthesis.concentrationLabel} (HHI ${synthesis.hhi}).\n` +
                `Expected annual return/vol: ${synthesis.expectedAnnualReturnPct}% / ${synthesis.expectedAnnualVolPct}%.\n` +
                `Allocation: ${alloc}.\n` +
                `Selected goal: ${goal.replace(/_/g, " ")}${strategy ? ` → recommended strategy "${strategy.name}" (${strategy.projectedReturnPct}% return @ ${strategy.projectedVolPct}% vol)` : ""}.\n\n` +
                `${findings.contextBlock}\n` +
                (buyLines ? `\nSPECIFIC BUY CANDIDATES (combined Stox + Koins):\n${buyLines}\n` : "") +
                `\nWrite the ZENITH briefing now, naming specific tickers to BUY.`,
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
        "Content-Disposition": `inline; filename="headmaster-intelligence-report.html"`,
      },
    });
  } catch (err: any) {
    console.error("[api/totalum/report] error:", err);
    return NextResponse.json({ ok: false, error: err?.message || "Failed to render report" }, { status: 500 });
  }
}
