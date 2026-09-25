import { NextResponse } from "next/server";
import { getStableSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * GET /api/session — the browser's paper-book owner.
 * Reads the session token and ignores session_data. Does not rotate the cookie.
 * HTTP 200 with `user: null` when signed out, so the client does not treat a
 * miss as a reason to call the rotating get-session.
 */
export async function GET() {
  const user = await getStableSessionUser();
  return NextResponse.json(
    {
      user: user
        ? {
            id: user.id,
            email: user.email,
            name: user.name,
            image: user.image ?? null,
            subscription_status: user.subscription_status ?? null,
            subscription_plan: user.subscription_plan ?? null,
          }
        : null,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
