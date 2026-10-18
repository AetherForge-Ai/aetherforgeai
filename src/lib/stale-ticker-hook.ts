/**
 * H-12 test hook. Its own file so a parallel G-05 feed hook can land beside it.
 *
 * Forces one ticker's price to look older than that market's Hold limit, then
 * resets it. Active only when GOAL_TEST_HOOKS=1 and the signed-in user id is
 * in GOAL_TEST_HOOK_USER_IDS (currentUserMayUseTestHooks). Nothing is written
 * to the book, the ledger, or a price snapshot. The list lives in a cookie on
 * that browser.
 */

export const STALE_TICKER_COOKIE = "af_test_stale_tickers";

const TICKER = /^[A-Z0-9.\-]{1,12}$/;

export function parseStaleTickerList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  let text = raw;
  try {
    text = decodeURIComponent(raw);
  } catch {
    text = raw;
  }
  const out: string[] = [];
  for (const part of text.split(",")) {
    const ticker = part.trim().toUpperCase();
    if (!TICKER.test(ticker) || out.includes(ticker)) continue;
    out.push(ticker);
  }
  return out.slice(0, 20);
}

/**
 * Add a ticker, or take it off. reset with an empty name clears the list.
 * An unusable name leaves the list unchanged.
 */
export function nextStaleTickerList(current: readonly string[], ticker: string, reset: boolean): string[] {
  const name = String(ticker || "").trim().toUpperCase();
  if (reset && !name) return [];
  if (!TICKER.test(name)) return parseStaleTickerList(current.join(","));
  if (reset) return current.filter((item) => item !== name);
  return parseStaleTickerList([...current, name].join(","));
}

export function isStaleTickerName(ticker: string): boolean {
  return TICKER.test(String(ticker || "").trim().toUpperCase());
}

/**
 * Tickers this request asked to treat as stale.
 * Returns [] when the hook is off, the account is not allow-listed, or there
 * is no request cookie (a scheduled report, for example).
 */
export async function forcedStaleTickersForRequest(): Promise<string[]> {
  try {
    const { currentUserMayUseTestHooks } = await import("@/lib/test-hooks.server");
    if (!(await currentUserMayUseTestHooks())) return [];
    const { cookies } = await import("next/headers");
    const jar = await cookies();
    return parseStaleTickerList(jar.get(STALE_TICKER_COOKIE)?.value);
  } catch {
    return [];
  }
}
