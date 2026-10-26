import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { aiPrivacyModeEnabled } from "@/lib/ai-privacy";
import { readAiPrivacyMode, saveAiPrivacyMode } from "@/lib/ai-privacy.server";

export const dynamic = "force-dynamic";

const notFound = () => NextResponse.json({ ok: false, error: "Not available." }, { status: 404 });

export async function GET() {
  if (!aiPrivacyModeEnabled()) return notFound();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ ok: true, data: { mode: await readAiPrivacyMode(user._id) } });
}

export async function POST(req: Request) {
  if (!aiPrivacyModeEnabled()) return notFound();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { mode?: unknown };
  if (body.mode !== "on" && body.mode !== "redacted" && body.mode !== "off") {
    return NextResponse.json({ ok: false, error: "Choose On, Hide amounts or Off." }, { status: 400 });
  }
  try {
    return NextResponse.json({ ok: true, data: { mode: await saveAiPrivacyMode(user._id, body.mode) } });
  } catch {
    return NextResponse.json({ ok: false, error: "That setting was not saved. Try again." }, { status: 503 });
  }
}
