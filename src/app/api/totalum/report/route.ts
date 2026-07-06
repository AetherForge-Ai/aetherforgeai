import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { loadTotalumSynthesis } from "@/lib/totalum-service";
import { isTotalumEntitled } from "../route";
import { renderTotalumReport } from "@/lib/totalum-report-html";
import { buildStrategy, type GoalKey } from "@/lib/totalum-engine";

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
    const html = renderTotalumReport(synthesis, { memberName: user.name, strategy });

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
