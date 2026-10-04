import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { loadTotalumSynthesis, loadReportFindings, loadHeadmasterIllustratedPath, saveHeadmasterIllustratedPath } from "@/lib/totalum-service";
import { isFullHeadmaster } from "../route";
import { renderTotalumReport } from "@/lib/totalum-report-html";
import { buildStrategy, type GoalKey } from "@/lib/totalum-engine";
import { HEADMASTER_BOT_LABEL } from "@/lib/report-language";
import { modelViewSentence, sanitizeHeadmasterReportHtml, scopeHeadmasterIdeas } from "@/lib/headmaster-trust";
import { fullBookFromPositions, publishSharedBookLog, illustratedPathDecision } from "@/lib/book-log";

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

    if (!isFullHeadmaster(user)) {
      return NextResponse.json(
        { ok: false, error: "The Total Portfolio Intelligence report is included with Pro." },
        { status: 403 }
      );
    }

    const url = new URL(req.url);
    const goalParam = url.searchParams.get("goal");
    const goal = (GOALS.includes(goalParam as GoalKey) ? goalParam : "balanced_growth") as GoalKey;
    const includeWatchlist = url.searchParams.get("watchlist") === "1";

    const [synthesis, findings, priorPath] = await Promise.all([
      loadTotalumSynthesis(user._id),
      loadReportFindings(user._id),
      loadHeadmasterIllustratedPath(user._id),
    ]);
    const book = fullBookFromPositions(synthesis.positions);
    const week = synthesis.scenarios.find((row) => row.horizon === "7D");
    const illustrated7dPct = week && Number.isFinite(week.basePct) ? week.basePct : null;
    const now = Date.now();
    const pathDecision = illustratedPathDecision({
      saved: priorPath,
      nowMs: now,
      illustrated7dPct,
      netWorthNZD: book.netWorthNZD,
    });
    publishSharedBookLog({
      ...book,
      sleeveLabel: "Sleeve",
      illustrated7dPct,
      priorIllustratedPath: pathDecision.pathMiss ? priorPath : null,
    });
    if (pathDecision.save) {
      try {
        await saveHeadmasterIllustratedPath(user._id, pathDecision.save);
      } catch (saveErr) {
        console.error("[api/totalum/report] Failed to persist the illustrated path (non-fatal):", saveErr);
      }
    }
    const strategy = synthesis.isEmpty ? null : buildStrategy(synthesis, goal);
    const heldTickers = synthesis.positions
      .filter((p) => p.assetClass !== "cash")
      .map((p) => p.label);
    const scoped = scopeHeadmasterIdeas(findings.ideas || [], heldTickers, includeWatchlist);

    const html = sanitizeHeadmasterReportHtml(
      renderTotalumReport(synthesis, {
        memberName: user.name,
        strategy,
        engine: HEADMASTER_BOT_LABEL,
        watchlist: includeWatchlist ? scoped.watchlist : [],
        book,
        pathMiss: pathDecision.pathMiss,
        modelView: modelViewSentence(synthesis.expectedAnnualReturnPct, synthesis.expectedAnnualVolPct),
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
