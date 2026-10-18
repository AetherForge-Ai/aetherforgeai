/** b37 REG-1: hard deadline for GET /api/ticker (TT saw a 30 s no-response under parallel load). */
export const TICKER_ROUTE_DEADLINE_MS = 4_000;
/** b37 REG-1: hard deadline for the /markets server render's data reads. */
export const MARKETS_SSR_DEADLINE_MS = 3_000;

/** b37 H-1: the newest of this read and the isolate's last good copy, so a client never steps back. */
export function pickServedSnapshot<T extends { version: number }>(read: T | null, lastGood: T | null): T | null {
  if (!read) return lastGood;
  if (!lastGood) return read;
  return read.version >= lastGood.version ? read : lastGood;
}

/** b37 REG-1: resolve to the fallback if the work takes longer than ms (or fails). */
export function withDeadline<T>(work: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    work.catch(() => fallback),
    new Promise<T>((resolve) => {
      timer = setTimeout(() => resolve(fallback), ms);
    }),
  ]).finally(() => timer && clearTimeout(timer));
}
