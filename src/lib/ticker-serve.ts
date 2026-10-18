/** b37 REG-1: hard deadline for GET /api/ticker (TT saw a 30 s no-response under parallel load). */
export const TICKER_ROUTE_DEADLINE_MS = 3_000; // b40: leaves 1 s for the snapshot fallback inside the 5 s bar
/** b38: a cold isolate waits this long for the durable snapshot (inside the route deadline). */
export const COLD_START_READ_MS = 2_500;
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

/**
 * b38 H-1 (c): cookie clients must never step back. Isolates in one colo share the Cache API, so the
 * newest snapshot served here is kept under one key; an isolate whose memory and store read are both
 * below the client's floor serves that copy instead of an older one. Best effort: no Cache API (tests,
 * local) simply returns null.
 */
const EDGE_SNAP_KEY = "https://af-internal.invalid/crypto-snapshot-latest";
type CacheLike = { match(k: string): Promise<Response | undefined>; put(k: string, r: Response): Promise<void> };
function edgeCache(): CacheLike | null {
  const c = (globalThis as unknown as { caches?: { default?: CacheLike } }).caches;
  return c?.default ?? null;
}

export async function edgeSnapshotGet<T extends { version: number }>(ms = 300): Promise<T | null> {
  const cache = edgeCache();
  if (!cache) return null;
  const hit = await withDeadline(cache.match(EDGE_SNAP_KEY), ms, undefined);
  if (!hit) return null;
  try {
    const snap = (await withDeadline(hit.json() as Promise<T>, ms, null)) as T | null;
    return snap && typeof snap.version === "number" ? snap : null;
  } catch {
    return null;
  }
}

export async function edgeSnapshotPut<T extends { version: number }>(snap: T): Promise<void> {
  const cache = edgeCache();
  if (!cache) return;
  try {
    const current = await edgeSnapshotGet<T>(200);
    if (current && current.version >= snap.version) return;
    await cache.put(EDGE_SNAP_KEY, new Response(JSON.stringify(snap), { headers: { "Content-Type": "application/json", "Cache-Control": "max-age=900" } }));
  } catch {
    /* best effort */
  }
}

type IndexLike = { tabs: Array<{ id: string; rows: unknown[] }>; priceRowCount: number };
/** b37 H-1: keep each tab's previous rows when the rebuild came back empty for that tab. */
export function mergeIndexTabs<T extends IndexLike>(fresh: T, prev: T | null): T {
  if (!prev) return fresh;
  const tabs = fresh.tabs.map((tab) => {
    if (tab.rows.length) return tab;
    const old = prev.tabs.find((t) => t.id === tab.id);
    return old?.rows.length ? old : tab;
  });
  return { ...fresh, tabs, priceRowCount: tabs.reduce((sum, tab) => sum + tab.rows.length, 0) } as T;
}

