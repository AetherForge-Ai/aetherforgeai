import { NextResponse } from "next/server";
import { composeWatchNotices, type WatchAlert, type WatchQuote } from "@/lib/holding-alert";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * POST /api/alerts/preview — compose holding notices for the signed-in member.
 * The response is a preview. This route does not send email.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as {
    alerts?: WatchAlert[];
    quotes?: Record<string, WatchQuote>;
    now?: string;
    today?: string;
  } | null;
  if (!body?.alerts || !body.quotes || !body.today) {
    return NextResponse.json({ ok: false, error: "Alert preview needs alerts, quotes and a date." }, { status: 400 });
  }
  const notices = composeWatchNotices({
    alerts: body.alerts,
    quotes: body.quotes,
    now: body.now ? new Date(body.now) : new Date(),
    today: body.today,
  });
  return NextResponse.json({ ok: true, sent: false, data: notices });
}
