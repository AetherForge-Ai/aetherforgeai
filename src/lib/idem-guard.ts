/**
 * b39 G-10 (P1, TT b38): real server-side dedupe for confirmed writes.
 *
 * Totalum has no unique constraint, so "look in the (cached) book, then insert" let two concurrent
 * POSTs with the same idempotency key both insert (TT: reload 0.4-4.3 s after Confirm, then the
 * journal replay, gave two NZ$100 deposit rows and NZ$200 cash). The guard:
 *  1. serialises requests per user+key inside an isolate (withKeyLock);
 *  2. looks the key up with a fresh, uncached query before inserting (never the book cache);
 *  3. after inserting, looks again: if another isolate inserted the same key concurrently, the
 *     earliest row wins and the others are reversed (cash included), so every racer converges on
 *     one row and answers with it;
 *  4. a deleted key is tombstoned, so a late replay can't recreate it (answer 410).
 * Pure and dependency-injected so the race can be tested without Totalum.
 */

export interface IdemRow {
  _id?: string;
  createdAt?: string | number | Date;
  notes?: string | null;
}

/** Totalum regex for a notes field carrying exactly `idem=<key>` (followed by a space or the end). */
export function idemNotesRegex(key: string): string {
  const esc = String(key).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return `idem=${esc}( |$)`;
}

/** The idempotency key stamped on a ledger row's notes, if any. */
export function idemKeyFromNotes(notes: string | null | undefined): string | null {
  const m = /(?:^|\s)idem=([^\s]{1,80})(?:\s|$)/.exec(String(notes || ""));
  return m ? m[1] : null;
}

const ts = (r: IdemRow) => {
  const v = r.createdAt instanceof Date ? r.createdAt.getTime() : typeof r.createdAt === "number" ? r.createdAt : Date.parse(String(r.createdAt || ""));
  return Number.isFinite(v) ? v : Number.MAX_SAFE_INTEGER;
};

/** Deterministic winner among rows sharing one key: earliest createdAt, then smallest id. */
export function pickIdemWinner<T extends IdemRow>(rows: readonly T[]): { winner: T | null; losers: T[] } {
  const sorted = rows.filter((r) => r && r._id).slice().sort((a, b) => ts(a) - ts(b) || String(a._id).localeCompare(String(b._id)));
  return { winner: sorted[0] ?? null, losers: sorted.slice(1) };
}

const locks = new Map<string, Promise<unknown>>();

/** Runs fn after any earlier call with the same lock key has finished (per isolate). */
export async function withKeyLock<T>(lockKey: string, fn: (waited: boolean) => Promise<T>): Promise<T> {
  const held = locks.get(lockKey);
  const prev = held ?? Promise.resolve();
  let release!: () => void;
  const mine = new Promise<void>((r) => (release = r));
  const chained = prev.catch(() => undefined).then(() => mine);
  locks.set(lockKey, chained);
  await prev.catch(() => undefined);
  try {
    return await fn(Boolean(held));
  } finally {
    release();
    if (locks.get(lockKey) === chained) locks.delete(lockKey);
  }
}

/* ------------------------------ tombstones ------------------------------ */

export const IDEM_TOMBSTONE_TTL_S = 7 * 24 * 60 * 60;
const memTomb = new Map<string, number>();
const tombUrl = (userId: string, key: string) => `https://af-internal.invalid/idem-tomb/${encodeURIComponent(userId)}/${encodeURIComponent(key)}`;

function edgeCache(): Cache | null {
  try {
    const c = (globalThis as unknown as { caches?: { default?: Cache } }).caches;
    return c?.default ?? null;
  } catch {
    return null;
  }
}

export async function markIdemTombstone(userId: string, key: string, now = Date.now()): Promise<void> {
  if (!userId || !key) return;
  memTomb.set(`${userId}:${key}`, now);
  const cache = edgeCache();
  if (!cache) return;
  try {
    await cache.put(tombUrl(userId, key), new Response("1", { headers: { "Cache-Control": `max-age=${IDEM_TOMBSTONE_TTL_S}` } }));
  } catch {
    /* best effort: memory + the client's own journal cancel still cover this */
  }
}

export async function isIdemTombstoned(userId: string, key: string, now = Date.now()): Promise<boolean> {
  if (!userId || !key) return false;
  const at = memTomb.get(`${userId}:${key}`);
  if (at && now - at < IDEM_TOMBSTONE_TTL_S * 1000) return true;
  const cache = edgeCache();
  if (!cache) return false;
  try {
    return Boolean(await cache.match(tombUrl(userId, key)));
  } catch {
    return false;
  }
}

export function resetIdemGuardForTests() {
  memTomb.clear();
  locks.clear();
}

/* ------------------------------ the guard ------------------------------ */

export interface IdemDeps<T extends IdemRow> {
  /** Fresh (uncached) rows of this user carrying the key. Throws on a failed read. */
  find: () => Promise<T[]>;
  /** Insert the write; returns the new row (with _id) and whatever the route needs. */
  insert: () => Promise<{ row: T | null | undefined }>;
  /** Reverse a duplicate row (cash included). Must tolerate "already gone". */
  reverse: (row: T) => Promise<void>;
  tombstoned: () => Promise<boolean>;
  /** The caller's own fresh lookup just found nothing; skip the repeat unless we queued behind another request. */
  knownEmpty?: boolean;
}

export type IdemOutcome<T> =
  | { kind: "replayed"; row: T; collapsed: number }
  | { kind: "inserted"; row: T; collapsed: number }
  | { kind: "lost-race"; row: T; collapsed: number }
  | { kind: "tombstoned" };

export async function guardedIdemWrite<T extends IdemRow>(lockKey: string, deps: IdemDeps<T>): Promise<IdemOutcome<T>> {
  return withKeyLock(lockKey, async (waited) => {
    if ((waited || !deps.knownEmpty) && (await deps.tombstoned())) return { kind: "tombstoned" } as const;
    const before = deps.knownEmpty && !waited ? [] : await deps.find();
    if (before.length) {
      const { winner, losers } = pickIdemWinner(before);
      for (const l of losers) await deps.reverse(l).catch(() => undefined);
      return { kind: "replayed", row: winner as T, collapsed: losers.length };
    }
    const { row } = await deps.insert();
    let after: T[] = [];
    try {
      after = await deps.find();
    } catch {
      after = [];
    }
    if (row && !after.some((r) => r._id === row._id)) after.push(row);
    const { winner, losers } = pickIdemWinner(after);
    for (const l of losers) await deps.reverse(l).catch(() => undefined);
    if (winner && row && winner._id !== row._id) return { kind: "lost-race", row: winner, collapsed: losers.length };
    return { kind: "inserted", row: (winner ?? row) as T, collapsed: losers.length };
  });
}
