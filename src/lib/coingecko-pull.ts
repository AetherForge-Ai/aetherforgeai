// pull-check:v3-goal-b64-2026-10-24
/**
 * b63 TT P3 (CoinGecko pull shrinking 400 → 263): page-level retries and a last-good full list.
 * CoinGecko serves 250 rows a page, so 400 needs pages 1 and 2. A page that fails is retried
 * (rate limit, 5xx, network); if it still fails, the rows that page held in the last good full
 * pull fill the gap so the list does not shrink, up to MARKET_LIST_TARGET.
 */
import { MARKET_LIST_TARGET } from "@/lib/crypto-coverage";

export const COINGECKO_PAGE_SIZE = 250;
export const COINGECKO_PAGES = Math.ceil(MARKET_LIST_TARGET / COINGECKO_PAGE_SIZE);
export const COINGECKO_RETRY_DELAYS_MS = [150, 450];
/** A last-good list older than this is not used to fill a short pull. */
export const LAST_GOOD_MAX_AGE_MS = 2 * 60 * 60 * 1000;

export type PageResult = { rows: unknown[]; status: number | null; retryable: boolean };

export function retryableStatus(status: number | null): boolean {
  return status == null || status === 429 || status === 1015 || status >= 500;
}

/** Reads one page, retrying a retryable failure. Never throws. */
export async function readPageWithRetry(
  read: () => Promise<PageResult>,
  delays: number[] = COINGECKO_RETRY_DELAYS_MS,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))
): Promise<PageResult> {
  let last: PageResult = { rows: [], status: null, retryable: true };
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      last = await read();
    } catch {
      last = { rows: [], status: null, retryable: true };
    }
    if (last.rows.length || !last.retryable) return last;
    if (attempt < delays.length) await sleep(delays[attempt]);
  }
  return last;
}

type Ranked = { id: string; rank?: number | null };

let lastGood: { at: number; coins: Ranked[] } | null = null;

/** Remember a pull only when it is a full list (never a shrunken one). */
export function rememberFullList<T extends Ranked>(coins: T[], now = Date.now()): void {
  if (coins.length >= MARKET_LIST_TARGET || coins.length >= (lastGood?.coins.length ?? 0)) {
    lastGood = { at: now, coins: coins.slice(0, MARKET_LIST_TARGET) };
  }
}

/** Fresh rows first; the last good full list fills missing ids, by rank, up to 400. */
export function fillFromLastGood<T extends Ranked>(fresh: T[], now = Date.now()): T[] {
  if (fresh.length >= MARKET_LIST_TARGET || !fresh.length || !lastGood) return fresh.slice(0, MARKET_LIST_TARGET);
  if (now - lastGood.at > LAST_GOOD_MAX_AGE_MS) return fresh;
  const seen = new Set(fresh.map((c) => c.id));
  const extra = (lastGood.coins as T[]).filter((c) => !seen.has(c.id));
  return [...fresh, ...extra]
    .sort((a, b) => (a.rank ?? 999999) - (b.rank ?? 999999))
    .slice(0, MARKET_LIST_TARGET);
}

export function resetLastGoodList(): void {
  lastGood = null;
}
