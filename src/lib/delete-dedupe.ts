/**
 * b71 (TT b70 P3): one DELETE per ledger id.
 * Repeated clicks, a journal replay after a reload, and the "delete on arrival" path could each send
 * DELETE for the same id. The second one answered 404 and the browser logged "Failed to load resource".
 * - A delete already in flight for an id is shared: a second call gets the same promise, no new request.
 * - An id the server already confirmed removed (200, or 404 = already gone) is remembered (this tab and
 *   localStorage, so a replay after a reload is covered) and answers success without a request.
 * - A 404 for a real (non-optimistic) id counts as success: the row is gone, which is what was asked.
 */
type StorageLike = Pick<Storage, "getItem" | "setItem">;
export type DeleteResult = { ok: boolean; status?: number; error?: unknown; data?: unknown };

const KEY = "af:confirmed-deletes";
const MAX = 200;
const inFlight = new Map<string, Promise<unknown>>();
const confirmedHere = new Set<string>();

function defaultStore(): StorageLike | null {
  try {
    return typeof window !== "undefined" && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
}

function readConfirmed(s: StorageLike | null): string[] {
  if (!s) return [];
  try {
    const list = JSON.parse(s.getItem(KEY) || "[]");
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function markDeleteConfirmed(id: string, s: StorageLike | null = defaultStore()): void {
  if (!id) return;
  confirmedHere.add(id);
  if (!s) return;
  try {
    const list = readConfirmed(s).filter((x) => x !== id);
    list.push(id);
    s.setItem(KEY, JSON.stringify(list.slice(-MAX)));
  } catch {
    /* blocked storage */
  }
}

export function isDeleteConfirmed(id: string, s: StorageLike | null = defaultStore()): boolean {
  return !!id && (confirmedHere.has(id) || readConfirmed(s).includes(id));
}

export function isDeleteInFlight(id: string): boolean {
  return inFlight.has(id);
}

/** 200, or 404 for an id that is not an optimistic placeholder: the row is gone. */
export function deleteSucceeded(id: string, res: { ok: boolean; status?: number }): boolean {
  return res.ok || (res.status === 404 && !String(id).startsWith("optimistic-"));
}

/**
 * Send at most one DELETE per id. `send` is only called when no request for the id is in flight and
 * the id is not already confirmed removed. A remembered or 404 result answers
 * { ok: true, status: 200, data: { alreadyRemoved: true } }.
 */
export function dedupedDelete<R extends DeleteResult>(id: string, send: () => Promise<R>, s: StorageLike | null = defaultStore()): Promise<R> {
  const gone = { ok: true, status: 200, data: { alreadyRemoved: true } } as unknown as R;
  if (isDeleteConfirmed(id, s)) return Promise.resolve(gone);
  const running = inFlight.get(id) as Promise<R> | undefined;
  if (running) return running;
  const p = (async () => {
    try {
      const res = await send();
      if (deleteSucceeded(id, res)) {
        markDeleteConfirmed(id, s);
        if (!res.ok || res.status === 204) return gone;
      }
      return res;
    } finally {
      inFlight.delete(id);
    }
  })();
  inFlight.set(id, p);
  return p;
}

/** Tests only. */
export function resetDeleteDedupe(): void {
  inFlight.clear();
  confirmedHere.clear();
}
