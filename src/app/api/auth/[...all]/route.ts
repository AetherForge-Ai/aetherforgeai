import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";
import { NextResponse } from "next/server";
import { SIGNUP_CONSENT_ERROR, validateSignupConsent } from "@/lib/signup-consent";

const handler = toNextJsHandler(auth);

export const GET = handler.GET;

/**
 * Better Auth returns 400 when sign-out runs without a live session (the
 * cookie was already cleared by a refresh race, or the page signs out twice).
 * That is a successful sign-out — respond 200 so the browser does not log a 400.
 * Sign-up is rejected here when the 18+ confirmation is missing, before an account is created.
 */
export async function POST(req: Request) {
  const pathname = new URL(req.url).pathname;
  const signingUp = /\/sign-up\/email\/?$/.test(pathname);
  if (signingUp) {
    const body = await req.clone().json().catch(() => null);
    const consent = validateSignupConsent(body);
    if (!consent.ok) {
      return NextResponse.json({ message: consent.error || SIGNUP_CONSENT_ERROR }, { status: 400 });
    }
  }
  const signingOut = /\/sign-out\/?$/.test(pathname);
  const res = await handler.POST(req);
  if (!signingOut || (res.status !== 400 && res.status !== 401)) return res;
  return NextResponse.json({ success: true, alreadySignedOut: true }, { status: 200 });
}
