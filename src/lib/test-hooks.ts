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
export const TEST_HOOKS_ENABLED = process.env.GOAL_TEST_HOOKS !== "0";
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
