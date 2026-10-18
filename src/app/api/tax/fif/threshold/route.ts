import { NextResponse } from "next/server";
import { z } from "zod";
import { requestClaimsOtherUser } from "@/lib/account-guard";
import { accountMismatchResponse } from "@/lib/account-response";
import { fifThresholdText } from "@/lib/fif-working-paper";
import { readFifThreshold, saveFifThreshold } from "@/lib/fif-setting.server";
import { getStableSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "private, no-store" };

/** b29 H-9: GET/POST the portfolio's FIF threshold (NZ$50,000, or NZ$100,000 jointly held). */
export async function GET(req: Request) {
  const user = await getStableSessionUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (user.identityConflict || requestClaimsOtherUser(req, user._id)) return accountMismatchResponse(user._id);
  const thresholdNzd = await readFifThreshold(user._id);
  return NextResponse.json({ ok: true, data: { thresholdNzd, label: fifThresholdText(thresholdNzd) } }, { headers: NO_STORE });
}

const body = z.object({ thresholdNzd: z.union([z.literal(50000), z.literal(100000)]) });

export async function POST(req: Request) {
  const user = await getStableSessionUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (user.identityConflict || requestClaimsOtherUser(req, user._id)) return accountMismatchResponse(user._id);
  const parsed = body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Choose NZ$50,000, or NZ$100,000 for a jointly held portfolio." }, { status: 400 });
  }
  try {
    const thresholdNzd = await saveFifThreshold(user._id, parsed.data.thresholdNzd);
    return NextResponse.json({ ok: true, data: { thresholdNzd, label: fifThresholdText(thresholdNzd) } }, { headers: NO_STORE });
  } catch (err) {
    console.error("[api/tax/fif/threshold] save failed:", err instanceof Error ? err.message.slice(0, 120) : "error");
    return NextResponse.json({ ok: false, error: "The threshold was not saved. Try again." }, { status: 500 });
  }
}
