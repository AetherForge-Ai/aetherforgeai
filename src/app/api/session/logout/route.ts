import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { applyExpiredAuthCookies, expireAuthCookies } from "@/lib/session-cookies";

export const dynamic = "force-dynamic";

/**
 * POST /api/session/logout — end the DB session and expire every auth cookie
 * name. A shared browser otherwise keeps session_data from one paper book
 * beside the next account's token.
 */
export async function POST() {
  const headerList = await headers();
  let upstream: Response | null = null;
  try {
    const result = await auth.api.signOut({
      headers: headerList,
      asResponse: true,
    });
    if (result instanceof Response) upstream = result;
  } catch (err) {
    console.error("[api/session/logout] signOut failed:", err);
  }

  const response = NextResponse.json(
    { ok: true },
    { headers: { "Cache-Control": "private, no-store" } },
  );
  if (upstream) {
    for (const cookie of upstream.headers.getSetCookie()) {
      response.headers.append("Set-Cookie", cookie);
    }
  }
  // Our expiry is appended last so it wins over a sign-out Set-Cookie that
  // did not match the secure cookie attributes.
  applyExpiredAuthCookies(response);
  await expireAuthCookies();
  return response;
}
