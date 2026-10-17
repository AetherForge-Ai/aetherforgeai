import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { storedBenchmarks } from "@/lib/benchmark-history";
import { auditBrief, briefsEnabled, buildMondayBrief, type BriefNews, type BriefPosition } from "@/lib/monday-brief";

export const dynamic = "force-dynamic";

/** Goal b17 G-03: builds the in-app brief. Behind IN_APP_BRIEFS=1. No AI call, no email. */
export async function POST(req: Request) {
  if (!briefsEnabled()) return NextResponse.json({ ok: false, error: "Not available." }, { status: 404 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Sign in to see your brief." }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as {
    weekOf?: string;
    netWorthNzd?: number | null;
    bookAsOf?: string;
    bookSource?: string;
    positions?: BriefPosition[];
    news?: BriefNews[];
  };
  const weekOf = /^\d{4}-\d{2}-\d{2}$/.test(String(body.weekOf)) ? String(body.weekOf) : new Date().toISOString().slice(0, 10);
  const brief = buildMondayBrief({
    weekOf,
    netWorthNzd: typeof body.netWorthNzd === "number" ? body.netWorthNzd : null,
    bookAsOf: String(body.bookAsOf || weekOf),
    bookSource: String(body.bookSource || "Your portfolio snapshot").slice(0, 80),
    positions: Array.isArray(body.positions) ? body.positions.slice(0, 200) : [],
    news: Array.isArray(body.news) ? body.news.slice(0, 20) : [],
    benchmarks: storedBenchmarks(),
  });
  return NextResponse.json({ ok: true, brief, audit: auditBrief(brief) });
}
