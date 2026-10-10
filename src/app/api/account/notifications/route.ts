import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import {
  EMAIL_PREFS_COOKIE,
  parseEmailPrefs,
  sanitizeEmailPrefs,
  serializeEmailPrefs,
} from "@/lib/notification-prefs";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const jar = await cookies();
  return NextResponse.json({
    ok: true,
    data: parseEmailPrefs(jar.get(EMAIL_PREFS_COOKIE)?.value),
    sending: false,
  });
}

export async function PUT(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as unknown;
  const prefs = sanitizeEmailPrefs(body);
  const jar = await cookies();
  jar.set(EMAIL_PREFS_COOKIE, serializeEmailPrefs(prefs), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    secure: process.env.NODE_ENV === "production",
  });
  return NextResponse.json({ ok: true, data: prefs, sending: false });
}
