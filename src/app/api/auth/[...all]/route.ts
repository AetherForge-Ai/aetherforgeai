import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";
import { NextResponse } from "next/server";
import { validateSignupConsent } from "@/lib/signup-consent";
import { authRateLimitRule, takeRateLimit, rateLimitHeaders, rateLimitIdentity, AUTH_EMAIL_LIMIT, AUTH_EMAIL_WINDOW_MS } from "@/lib/ip-rate-limit";
import { ensureDurableRateLimit } from "@/lib/durable-counter.server";

ensureDurableRateLimit();

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
  // CR-5: sign-in, sign-up and password-reset POSTs are limited per address.
  const rule = authRateLimitRule(pathname);
  if (rule) {
    const identity = rateLimitIdentity(req);
    const ip = identity.ok ? identity.ip : "unknown";
    // b7 CR-5: keyed by address AND email, so one attacker cannot hammer one
    // account and one shared NAT does not lock out everyone else's account.
    const body = (await req.clone().json().catch(() => null)) as { email?: unknown; username?: unknown } | null;
    const who = String(body?.email ?? body?.username ?? "").trim().toLowerCase().slice(0, 254);
    const key = `auth:${rule.name}:${encodeURIComponent(ip)}:${encodeURIComponent(who)}`;
    const now = Date.now();
    // Goal b8 CR-5: a per-address cap too, so 20 tries from one IP across many
    // emails are still refused inside 5 minutes.
    const ipResult = await takeRateLimit(`auth:${rule.name}:ip:${encodeURIComponent(ip)}`, rule.ipLimit, rule.windowMs, now);
    const pairResult = await takeRateLimit(key, rule.limit, rule.windowMs, now, { edge: "AUTH_RATE_LIMITER" });
    // Goal b11 CR-5: per-email bucket that ignores the address, so rotating
    // IPv6 addresses cannot keep guessing one account. Generic message only.
    const emailResult =
      rule.name === "sign-in" && who
        ? await takeRateLimit(`auth:sign-in:email:${encodeURIComponent(who)}`, AUTH_EMAIL_LIMIT, AUTH_EMAIL_WINDOW_MS, now)
        : null;
    const result = !ipResult.allowed ? ipResult : emailResult && !emailResult.allowed ? emailResult : pairResult;
    if (!result.allowed) {
      return NextResponse.json(
        { code: "TOO_MANY_REQUESTS", message: rule.message },
        { status: 429, headers: rateLimitHeaders(result, true) }
      );
    }
  }
  const signingUp = /\/sign-up\/email\/?$/.test(pathname);
  if (signingUp) {
    const body = await req.clone().json().catch(() => null);
    const consent = validateSignupConsent(body);
    if (consent.ok === false) {
      return NextResponse.json({ message: consent.error }, { status: 400 });
    }
  }
  const signingOut = /\/sign-out\/?$/.test(pathname);
  const res = await handler.POST(req);
  if (!signingOut || (res.status !== 400 && res.status !== 401)) return res;
  return NextResponse.json({ success: true, alreadySignedOut: true }, { status: 200 });
}
