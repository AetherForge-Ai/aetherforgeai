import { NextResponse } from "next/server";
import { aggregate, FUNNEL_EVENTS, type FunnelEvent } from "@/lib/onboarding/funnel-core";
import { PRIVACY_OFFICER_EMAIL } from "@/lib/public-copy";
import { ONBOARDING_FUNNEL_EVENT } from "@/lib/schema/onboarding-funnel.schema";
import { flagOn } from "@/lib/schema/types";
import { getCurrentUser } from "@/lib/session";
import { totalumSdk } from "@/lib/totalum";

export const dynamic = "force-dynamic";
const NO_STORE = { "cache-control": "private, no-store, max-age=0" };

/**
 * b66 G-28 GET /api/admin/onboarding-funnel: owner-only summary (the site owner's account; anyone else
 * gets 404). Counts per event plus checklist steps and quiz plans. Never returns rows, user ids or anon ids.
 */
export async function GET() {
  const session = await getCurrentUser();
  if (!session || session.email.trim().toLowerCase() !== PRIVACY_OFFICER_EMAIL.toLowerCase()) {
    return new NextResponse("Not found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8", ...NO_STORE } });
  }
  // b86 G-28: with the flag off the summary does not exist (404), same as for non-owners.
  if (!flagOn("ONBOARDING_FUNNEL_SERVER")) {
    return new NextResponse("Not found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8", ...NO_STORE } });
  }
  try {
    const res = await totalumSdk.crud.query(ONBOARDING_FUNNEL_EVENT.table, { _limit: 5000 } as never);
    const rows = (((res as { data?: Record<string, unknown>[] })?.data) || []).map((r) => ({
      event: String(r.event || "") as FunnelEvent,
      step: String(r.step_key || ""),
      plan: String(r.plan_result || ""),
    }));
    const steps: Record<string, number> = {};
    const plans: Record<string, number> = {};
    for (const r of rows) {
      if (r.event === "checklist_step" && r.step) steps[r.step] = (steps[r.step] ?? 0) + 1;
      if (r.event === "quiz_result" && r.plan) plans[r.plan] = (plans[r.plan] ?? 0) + 1;
    }
    return NextResponse.json(
      { ok: true, enabled: true, rowsRead: rows.length, capped: rows.length >= 5000, events: aggregate(rows.filter((r) => FUNNEL_EVENTS.includes(r.event))), steps, plans },
      { headers: NO_STORE }
    );
  } catch {
    console.error("[admin/onboarding-funnel] read failed");
    return NextResponse.json({ ok: false, error: "Funnel summary is unavailable just now." }, { status: 503, headers: NO_STORE });
  }
}
