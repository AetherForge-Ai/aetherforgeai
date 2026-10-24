/**
 * b64 TT P3 (/markets p90 TTFB 2.21 s after a gap): a short in-code stale-while-revalidate memo.
 * Within freshMs the cached value is returned. After that, up to staleMs, the cached value is still
 * returned at once and one background refresh replaces it. Past staleMs (or with nothing cached) the
 * caller waits for the load. A failed or empty load never replaces a good value. No edge or dashboard rule.
 */
export interface SwrMemo<T> {
  get(): Promise<T>;
  peek(): T | null;
  reset(): void;
}

export function swrMemo<T>(
  load: () => Promise<T>,
  opts: { freshMs: number; staleMs: number; keep?: (value: T) => boolean; now?: () => number }
): SwrMemo<T> {
  const now = opts.now ?? Date.now;
  const keep = opts.keep ?? ((value: T) => value != null);
  let entry: { value: T; at: number } | null = null;
  let inflight: Promise<T> | null = null;

  const refresh = (): Promise<T> => {
    if (inflight) return inflight;
    const work = load()
      .then((value) => {
        if (keep(value)) entry = { value, at: now() };
        return entry && !keep(value) ? entry.value : value;
      })
      .finally(() => {
        inflight = null;
      });
    inflight = work;
    return work;
  };

  return {
    async get() {
      if (entry) {
        const age = now() - entry.at;
        if (age < opts.freshMs) return entry.value;
        if (age < opts.staleMs) {
          void refresh().catch(() => undefined);
          return entry.value;
        }
      }
      return refresh();
    },
    peek: () => entry?.value ?? null,
    reset() {
      entry = null;
      inflight = null;
    },
  };
}
