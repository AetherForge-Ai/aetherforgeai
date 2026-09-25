import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { expireAuthCookies } from "@/lib/session-cookies";

export const dynamic = "force-dynamic";

/**
 * POST /api/session/logout — end the DB session and expire every auth cookie
 * name. A shared browser otherwise keeps session_data from one paper book
 * beside the next account's token.
 */
export async function POST() {
  try {
    const headerList = await headers();
    await auth.api.signOut({ headers: headerList });
  } catch (err) {
    console.error("[api/session/logout] signOut failed:", err);
  }
  await expireAuthCookies();
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
}
