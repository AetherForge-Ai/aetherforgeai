/**
 * Goal b10 test-mode hooks for TT's live checks (G-04, G-05).
 *
 * Hooks are ON unless GOAL_TEST_HOOKS=0. They never persist data, never send
 * anything, and every simulated figure is labelled "Simulated test quote".
 * - Feed off (G-05): cookie `af_test_feed_off=1` makes /api/ticker answer 503
 *   for that browser only, so price cells go amber then red.
 * - Simulated price (G-04): GET /api/watches?simulate=TICKER:price:changePct
 *   evaluates the signed-in member's own watches against that quote.
 */
// Goal b20 SECURITY: hooks are OFF unless GOAL_TEST_HOOKS=1, and even then only
// for an allow-listed signed-in test account (see testHooksAllowedFor). The
// constant only says the deployment switch is on; it never grants a hook alone.
export const TEST_HOOKS_ENABLED = process.env.GOAL_TEST_HOOKS === "1";

/** Allowed test identities: ids in GOAL_TEST_HOOK_USER_IDS, or emails at an allowed domain (default @example.invalid). */
export function testHooksAllowedFor(
  user: { _id?: string | null; email?: string | null } | null | undefined,
  env: Record<string, string | undefined> = process.env
): boolean {
  if (env.GOAL_TEST_HOOKS !== "1" || !user) return false;
  const ids = String(env.GOAL_TEST_HOOK_USER_IDS || "").split(",").map((v) => v.trim()).filter(Boolean);
  if (user._id && ids.includes(String(user._id))) return true;
  const domains = String(env.GOAL_TEST_HOOK_EMAIL_DOMAINS || "example.invalid")
    .split(",")
    .map((v) => v.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);
  const email = String(user.email || "").toLowerCase();
  const at = email.lastIndexOf("@");
  return at > 0 && domains.includes(email.slice(at + 1));
}
export const FEED_OFF_COOKIE = "af_test_feed_off";
export const SIMULATED_SOURCE = "Simulated test quote";

export function feedOffFromCookieHeader(cookie: string | null | undefined, enabled = TEST_HOOKS_ENABLED): boolean {
  if (!enabled || !cookie) return false;
  return cookie.split(";").some((part) => part.trim() === `${FEED_OFF_COOKIE}=1`);
}

export interface SimulatedQuote {
  ticker: string;
  price: number | null;
  changePct: number | null;
}

/** Parse `TICKER:price:changePct` (price or change may be blank). Several are comma-separated. */
export function parseSimulate(raw: string | null | undefined, enabled = TEST_HOOKS_ENABLED): SimulatedQuote[] {
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
