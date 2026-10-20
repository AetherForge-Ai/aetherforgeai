import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";
import { NextResponse } from "next/server";
import { validateSignupConsent } from "@/lib/signup-consent";
import { authRateLimitRule, normaliseLoginEmail, sha256Hex, takeRateLimit, takeAtomicLimit, rateLimitHeaders, rateLimitIdentity, AUTH_EMAIL_LIMIT, AUTH_EMAIL_WINDOW_MS } from "@/lib/ip-rate-limit";
import { ensureDurableRateLimit } from "@/lib/durable-counter.server";
import { cookieValue, sessionExpiresInFuture, setCookieClears, verifySignedSessionToken, withoutClears } from "@/lib/session-token";

ensureDurableRateLimit();

const handler = toNextJsHandler(auth);


/**
 * b27 H-4 (session drops): better-auth's get-session clears the session cookie whenever its
 * store read fails or the session touch errors, so a slow Totalum read signed members out.
 * A clear is passed through only when this request's token is definitely gone (bad signature,
 * no row, or expired). Every decision is logged with its reason; tokens are never logged.
 */
export async function GET(req: Request) {
  const pathname = new URL(req.url).pathname;
  if (!/\/get-session\/?$/.test(pathname)) return handler.GET(req);
  const res = await handler.GET(req);
  const lines = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  if (!lines.length) return res;
  const ctx = await auth.$context;
  const tokenName = ctx.authCookies.sessionToken.name;
  const dataName = ctx.authCookies.sessionData.name;
  if (!lines.some((l) => setCookieClears(l, tokenName))) return res;
  const verdict = await sessionGone(req.headers.get("cookie"), ctx);
  if (verdict.gone) {
    console.info("[session] cookie cleared by get-session:", verdict.reason);
    return res;
  }
  console.warn("[session] kept the session cookie; get-session tried to clear it:", verdict.reason);
  const headers = new Headers(res.headers);
  headers.delete("set-cookie");
  for (const l of withoutClears(lines, [tokenName, dataName])) headers.append("set-cookie", l);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

async function sessionGone(
  cookieHeader: string | null,
  ctx: Awaited<typeof auth.$context>
): Promise<{ gone: boolean; reason: string }> {
  const raw = cookieValue(cookieHeader, ctx.authCookies.sessionToken.name);
  if (!raw) return { gone: true, reason: "no session cookie on the request" };
  const token = await verifySignedSessionToken(raw, ctx.secret);
  if (!token) return { gone: true, reason: "signature did not verify" };
  try {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const found = (await Promise.race([
      Promise.resolve(ctx.internalAdapter.findSession(token)),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), 4000);
      }),
    ]).finally(() => timer && clearTimeout(timer))) as { session?: { expiresAt?: unknown } } | null;
    if (!found?.session) return { gone: true, reason: "no session row for this token" };
    if (!sessionExpiresInFuture(found.session.expiresAt)) return { gone: true, reason: "session expired" };
    return { gone: false, reason: "session row is valid" };
  } catch (err) {
    return { gone: false, reason: `store read failed (${err instanceof Error ? err.message.slice(0, 60) : "error"})` };
  }
}

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
    const who = normaliseLoginEmail(body?.email ?? body?.username);
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
        ? await takeAtomicLimit(`login:email:${await sha256Hex(who)}`, AUTH_EMAIL_LIMIT, AUTH_EMAIL_WINDOW_MS, now)
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
