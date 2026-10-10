import { NextResponse } from "next/server";
import { previewActivityEmail, type ActivityEmailKind } from "@/lib/activity-email";
import { readActivityEmailPrefs } from "@/lib/activity-email-server";

export const dynamic = "force-dynamic";

const KINDS = new Set<ActivityEmailKind>([
  "welcome",
  "report-ready",
  "trade-ledger",
  "weekly-summary",
  "product-news",
]);

/**
 * Preview log only. This route does not call a mail sender.
 * Signup can ask for a welcome preview before a session exists.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    kind?: string;
    name?: string;
    reportTitle?: string;
    tradeLabel?: string;
  };
  if (!body.kind || !KINDS.has(body.kind as ActivityEmailKind)) {
    return NextResponse.json({ ok: false, error: "Unknown email kind." }, { status: 400 });
  }
  const prefs = await readActivityEmailPrefs();
  const preview = previewActivityEmail({
    kind: body.kind as ActivityEmailKind,
    to: "member@example.com",
    name: typeof body.name === "string" ? body.name.slice(0, 80) : undefined,
    prefs,
    reportTitle: typeof body.reportTitle === "string" ? body.reportTitle.slice(0, 120) : undefined,
    tradeLabel: typeof body.tradeLabel === "string" ? body.tradeLabel.slice(0, 80) : undefined,
  });
  return NextResponse.json({
    ok: true,
    sent: false,
    mode: preview.mode,
    reason: preview.reason,
    subject: preview.subject,
  });
}
