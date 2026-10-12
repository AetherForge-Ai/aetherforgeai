/**
 * One Confirm per Review inside this process.
 * The key is not a database column. A second click waits on the first write.
 * A different isolate does not see this map. The notes stamp is the record of the key.
 *
 * pull-check:v3-tier1a-2026-10-12
 */

const TTL_MS = 10 * 60 * 1000;

interface Slot {
  at: number;
  promise: Promise<unknown>;
}

const inflight = new Map<string, Slot>();

export function confirmMapKey(userId: string, key: string | null | undefined): string {
  const idem = (key || "").trim().slice(0, 80);
  if (!userId || !idem) return "";
  return `${userId}:${idem}`;
}

export function withIdempotencyNote(notes: string, key: string | null | undefined): string {
  const idem = (key || "").trim().slice(0, 80);
  if (!idem) return notes.slice(0, 500);
  const stamp = `idem=${idem}`;
  const sep = " ";
  const room = 500 - stamp.length - sep.length;
  const body = notes.split(stamp).join(" ").trim();
  const head = room > 0 ? body.slice(0, room).trimEnd() : "";
  return head ? `${head}${sep}${stamp}` : stamp;
}

/** Runs `work` once per key until it settles. A failed write can be retried. */
export function confirmOnce<T>(key: string, work: () => Promise<T>): Promise<T> {
  if (!key) return work();
  const now = Date.now();
  const existing = inflight.get(key);
  if (existing && now - existing.at < TTL_MS) return existing.promise as Promise<T>;
  const promise = work().catch((err: unknown) => {
    const current = inflight.get(key);
    if (current?.promise === promise) inflight.delete(key);
    throw err;
  });
  inflight.set(key, { at: now, promise });
  return promise;
}
