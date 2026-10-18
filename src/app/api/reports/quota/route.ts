import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { evaluateFreeReportQuota, monthlyReportLimit } from "@/lib/entitlements";
import { countFreeReportsThisMonth } from "@/lib/report-month-count.server";
import { readReportQuota } from "@/lib/dashboard-quota.server";

export const dynamic = "force-dynamic";

/**
 * Goal b12 H-4: the monthly report allowance on its own, one indexed count and
 * no report bodies, so Plan usage paints with the dashboard instead of waiting
 * for the full report list. Rolling-window plans answer { limit: null }.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const limit = monthlyReportLimit(user.subscription_plan);
  if (limit == null) {
    return NextResponse.json({ ok: true, used: null, limit: null }, { headers: { "Cache-Control": "private, no-store" } });
  }
  // b38 H-4: bounded (900 ms) with the per-user last-good cache; a slow count never holds the figure.
  const read = await readReportQuota(900, 1);
  if (read.ok && read.limit != null) {
    return NextResponse.json(
      { ok: true, used: read.used, limit: read.limit, remaining: Math.max(0, read.limit - read.used) },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  }
  if ("reason" in read && read.reason === "timeout") {
    return NextResponse.json({ ok: true, used: null, limit: null, pending: true }, { headers: { "Cache-Control": "private, no-store" } });
  }
  const { count } = await countFreeReportsThisMonth(user._id, Date.now());
  const q = evaluateFreeReportQuota(count, Date.now(), limit);
  return NextResponse.json(
    { ok: true, used: q.used, limit: q.limit, remaining: q.remaining },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
