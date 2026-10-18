import { NextResponse } from "next/server";
import { totalumSdk } from "@/lib/totalum";
import { extractCalls, weeklyScorecard, type TrackCall } from "@/lib/track-record";
import { aucklandYmd } from "@/lib/entitlements";

export const dynamic = "force-dynamic";

/**
 * Goal b19 G-20, collect only. GET /api/cron/track-record (CRON_SECRET).
 * Reads saved reports from the last 14 days (read-only), hashes every call and
 * returns this week's scorecard. Nothing is written, emailed or published.
 * Later prices are not fetched yet, so scored calls stay "pending" until a
 * stored close exists; no hit rate is invented.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: "Disabled: CRON_SECRET is not set." }, { status: 503 });
  const url = new URL(req.url);
  const bearer = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (url.searchParams.get("key") !== secret && req.headers.get("x-cron-secret") !== secret && bearer !== secret) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const since = new Date(Date.now() - 14 * 86400_000).toISOString();
  const res = await totalumSdk.crud.query("report", { _limit: 500 });
  const rows = ((res?.data as unknown as Array<{ _id?: string; bot?: string; generated_at?: string; payload?: string }>) || []).filter(
    (r) => (r.generated_at || "") >= since
  );
  const calls: TrackCall[] = [];
  for (const r of rows) calls.push(...(await extractCalls(r)));
  const card = await weeklyScorecard(aucklandYmd(), calls, {});
  return NextResponse.json({ ok: true, reportsRead: rows.length, data: card });
}
