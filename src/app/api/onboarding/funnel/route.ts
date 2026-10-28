import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { featureOnFor, tableMissing } from "@/lib/preview-grading";
import { testHooksAllowedFor } from "@/lib/test-hooks";
import { ONBOARDING_FUNNEL_EVENT } from "@/lib/schema/onboarding-funnel.schema";
import { getStableSessionUser } from "@/lib/session";
import { totalumSdk } from "@/lib/totalum";
import { FUNNEL_COOKIE, funnelRow, makeLimiter } from "@/lib/onboarding/funnel-core";

export const dynamic = "force-dynamic";
const limit = makeLimiter(30, 60_000);

/**
 * G-28: POST {event, stepKey?, planResult?, consent} — write-only. Behind ONBOARDING_FUNNEL_SERVER=on
 * (off = 204 and nothing written; the localStorage count stays as the fallback). No IP stored.
 * The anon cookie is set by the client only after analytics consent; without it, signed-out events are dropped.
 */
export async function POST(req: Request) {
  const user = await getStableSessionUser().catch(() => null);
  // b91 G-28: flag off = 204 and nothing written, except for allow-listed test accounts (preview grading).
  if (!featureOnFor("ONBOARDING_FUNNEL_SERVER", user)) return new NextResponse(null, { status: 204 });
  const tester = testHooksAllowedFor(user);
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const anonId = (await cookies()).get(FUNNEL_COOKIE)?.value || null;
  const key = user?._id || anonId || "anon";
  if (!limit(key)) return NextResponse.json({ ok: false, error: "Too many events." }, { status: 429 });
  const decision = funnelRow({ event: body.event, stepKey: body.stepKey, planResult: body.planResult, userId: user?._id || null, anonId, consent: body.consent === true });
  if (!decision.write) return new NextResponse(null, { status: "reason" in decision && decision.reason === "no_consent" ? 204 : 400 });
  try {
    const { user: u, ...rest } = decision.row;
    await totalumSdk.crud.createRecord(ONBOARDING_FUNNEL_EVENT.table, (u ? { ...rest, user: u } : rest) as never);
    return new NextResponse(null, { status: 204, headers: tester ? { "x-af-funnel": "stored" } : undefined });
  } catch (err) {
    // The table is unconfirmed: a missing table never breaks onboarding (the localStorage count stays).
    console.error("[api/onboarding/funnel] write failed");
    return new NextResponse(null, { status: 204, headers: tester ? { "x-af-funnel": tableMissing(err) ? "table-missing" : "write-failed" } : undefined });
  }
}
