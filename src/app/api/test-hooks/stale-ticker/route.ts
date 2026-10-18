import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { currentUserMayUseTestHooks } from "@/lib/test-hooks.server";
import {
  STALE_TICKER_COOKIE,
  isStaleTickerName,
  nextStaleTickerList,
  parseStaleTickerList,
} from "@/lib/stale-ticker-hook";

export const dynamic = "force-dynamic";

const PRIVATE = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };

/** 404 for everyone except an allow-listed account with GOAL_TEST_HOOKS=1. */
async function allowOrMissing(): Promise<NextResponse | null> {
  if (await currentUserMayUseTestHooks()) return null;
  return new NextResponse(null, { status: 404, headers: PRIVATE });
}

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge,
    secure: process.env.NODE_ENV === "production",
  };
}

/** The tickers this browser is forcing stale. */
export async function GET() {
  const denied = await allowOrMissing();
  if (denied) return denied;
  const jar = await cookies();
  const stale = parseStaleTickerList(jar.get(STALE_TICKER_COOKIE)?.value);
  return NextResponse.json({ ok: true, stale }, { headers: PRIVATE });
}

/**
 * Body: { ticker: "FPH.NZ" } forces that name stale.
 * Body: { ticker: "FPH.NZ", reset: true } puts that name back.
 * Body: { reset: true } clears the list.
 */
export async function POST(req: Request) {
  const denied = await allowOrMissing();
  if (denied) return denied;
  const body = (await req.json().catch(() => ({}))) as { ticker?: unknown; reset?: unknown };
  const ticker = String(body.ticker ?? "");
  const reset = body.reset === true;
  if (!reset && !isStaleTickerName(ticker)) {
    return NextResponse.json({ ok: false, error: "Name a ticker such as FPH.NZ or BTC." }, { status: 400, headers: PRIVATE });
  }
  const jar = await cookies();
  const current = parseStaleTickerList(jar.get(STALE_TICKER_COOKIE)?.value);
  const stale = nextStaleTickerList(current, ticker, reset);
  const res = NextResponse.json({ ok: true, stale, reset }, { headers: PRIVATE });
  res.cookies.set(STALE_TICKER_COOKIE, stale.join(","), cookieOptions(stale.length ? 60 * 60 : 0));
  return res;
}
