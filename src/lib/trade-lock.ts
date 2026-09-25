/**
 * Serialise paper fills for one account inside this process.
 *
 * Two buys that both read the same quantity and both insert a ledger row
 * leave a row whose shares were overwritten. Overlapping fills wait their
 * turn, then re-read cash and the holding before writing.
 */

const tails = new Map<string, Promise<unknown>>();

export function withUserTradeLock<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  const key = userId || "anonymous";
  const prev = tails.get(key) ?? Promise.resolve();
  const run = prev.then(fn, fn);
  const settled = run.then(
    () => undefined,
    () => undefined
  );
  tails.set(key, settled);
  settled.then(() => {
    if (tails.get(key) === settled) tails.delete(key);
  });
  return run;
}
