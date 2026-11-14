/**
 * Goal b10 test-mode hooks for TT's live checks (G-04, G-05).
 *
 * Hooks are OFF unless GOAL_TEST_HOOKS is exactly "1" and this is not a
 * production release build (see goalTestHooksOn). They never persist data,
 * never send anything, and every simulated figure is labelled "Simulated test quote".
 * - Feed off (G-05): cookie `af_test_feed_off=1` makes /api/ticker answer 503
 *   for that browser only, so price cells go amber then red.
 * - Simulated price (G-04): GET /api/watches?simulate=TICKER:price:changePct
 *   evaluates the signed-in member's own watches against that quote.
 */
import { goalTestHooksOn } from "@/lib/goal-test-hooks";

// Goal b20 SECURITY: hooks are OFF unless GOAL_TEST_HOOKS=1, and even then only
// for an allow-listed signed-in test account (see testHooksAllowedFor). The
// switch never grants a hook alone, and a production release marker forces it off.
export function testHooksEnabled(
  env: Record<string, string | undefined> = process.env,
  marker?: string,
): boolean {
  return goalTestHooksOn(env, marker);
}

/**
 * b24 SECURITY: allowed test identities are the account ids in GOAL_TEST_HOOK_USER_IDS only.
 * There is no email-domain allow-list: anyone can sign up with any address.
 */
export function testHooksAllowedFor(
  user: { _id?: string | null; email?: string | null } | null | undefined,
  env: Record<string, string | undefined> = process.env
): boolean {
  if (!goalTestHooksOn(env) || !user?._id) return false;
  const ids = String(env.GOAL_TEST_HOOK_USER_IDS || "").split(",").map((v) => v.trim()).filter(Boolean);
  return ids.includes(String(user._id));
}
export const FEED_OFF_COOKIE = "af_test_feed_off";
export const SIMULATED_SOURCE = "Simulated test quote";

export function feedOffFromCookieHeader(cookie: string | null | undefined, enabled = testHooksEnabled()): boolean {
  if (!enabled || !cookie) return false;
  return cookie.split(";").some((part) => part.trim() === `${FEED_OFF_COOKIE}=1`);
}

export interface SimulatedQuote {
  ticker: string;
  price: number | null;
  changePct: number | null;
}

/** Parse `TICKER:price:changePct` (price or change may be blank). Several are comma-separated. */
export function parseSimulate(raw: string | null | undefined, enabled = testHooksEnabled()): SimulatedQuote[] {
  if (!enabled || !raw) return [];
  const out: SimulatedQuote[] = [];
  for (const chunk of raw.split(",")) {
    const [t, p, c] = chunk.split(":");
    const ticker = String(t || "").trim().toUpperCase();
    if (!/^[A-Z0-9.\-]{1,12}$/.test(ticker)) continue;
    const num = (v?: string) => (v == null || v.trim() === "" || !Number.isFinite(Number(v)) ? null : Number(v));
    out.push({ ticker, price: num(p), changePct: num(c) });
  }
  return out.slice(0, 10);
}
