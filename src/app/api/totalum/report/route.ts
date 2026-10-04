import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { loadTotalumSynthesis, loadReportFindings } from "@/lib/totalum-service";
import { isFullHeadmaster } from "../route";
import { renderTotalumReport } from "@/lib/totalum-report-html";
import { buildStrategy, type GoalKey } from "@/lib/totalum-engine";
import { HEADMASTER_BOT_LABEL } from "@/lib/report-language";
import { sanitizeHeadmasterReportHtml, scopeHeadmasterIdeas } from "@/lib/headmaster-trust";
import { publishSharedBookLog } from "@/lib/book-log";

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

    const [synthesis, findings] = await Promise.all([
      loadTotalumSynthesis(user._id),
      loadReportFindings(user._id),
    ]);
    const classOf = (key: "cash" | "equities" | "crypto" | "metals") =>
      synthesis.classAllocation.find((row) => row.assetClass === key)?.valueNZD ?? 0;
    const week = synthesis.scenarios.find((row) => row.horizon === "7D");
    publishSharedBookLog({
      cashNZD: classOf("cash"),
      stocksNZD: classOf("equities"),
      cryptoNZD: classOf("crypto"),
      metalsNZD: classOf("metals"),
      sleeveNZD: synthesis.totalValueNZD,
      sleeveLabel: "Headmaster",
      illustrated7dPct: week && Number.isFinite(week.basePct) ? week.basePct : null,
    });
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
