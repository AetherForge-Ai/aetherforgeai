import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";
import { NextResponse } from "next/server";

const handler = toNextJsHandler(auth);

export const GET = handler.GET;

/**
 * Better Auth returns 400 when sign-out runs without a live session (the
 * cookie was already cleared by a refresh race, or the page signs out twice).
 * That is a successful sign-out — respond 200 so the browser does not log a 400.
 */
export async function POST(req: Request) {
  const signingOut = /\/sign-out\/?$/.test(new URL(req.url).pathname);
  const res = await handler.POST(req);
  if (!signingOut || (res.status !== 400 && res.status !== 401)) return res;
  return NextResponse.json({ success: true, alreadySignedOut: true }, { status: 200 });
}
