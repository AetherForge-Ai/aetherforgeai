/**
 * b32 G-10 (P1, TT b31 signed-in): read-your-writes that survives a reload.
 *
 * The b28 reconcile kept deleted ids in a React ref, so a reload 6-17 s after a delete (Totalum
 * read lag) brought the row and the old cash back. The journal keeps, per user and in
 * sessionStorage, every acknowledged write of the last RECONCILE_WINDOW_MS: deleted row ids,
 * created row ids and the server's cash after the write. A lagging read is corrected from it:
 * deleted rows stay gone, and the cash shown is the acknowledged figure. Entries drop once the
 * server's read agrees (or the window passes). Only server-acknowledged writes go in.
 */
import { RECONCILE_WINDOW_MS } from "@/lib/ledger-reconcile";
import { withCashDelta, type PortfolioSnapshot } from "@/lib/portfolio-snapshot";

export interface WriteJournal {
  deleted: Record<string, number>;
  created: Record<string, number>;
  cash: { value: number; at: number } | null;
  lastAt: number;
}

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const key = (userId: string) => `af:write-journal:${userId}`;
const empty = (): WriteJournal => ({ deleted: {}, created: {}, cash: null, lastAt: 0 });

function store(): StorageLike | null {
  try {
    return typeof window !== "undefined" ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

export function pruneJournal(j: WriteJournal, now = Date.now()): WriteJournal {
  const fresh = (at: number) => now - at <= RECONCILE_WINDOW_MS;
  const keep = (m: Record<string, number>) => Object.fromEntries(Object.entries(m).filter(([, at]) => fresh(at)));
  return { deleted: keep(j.deleted), created: keep(j.created), cash: j.cash && fresh(j.cash.at) ? j.cash : null, lastAt: j.lastAt };
}

export function readJournal(userId: string | null | undefined, s: StorageLike | null = store(), now = Date.now()): WriteJournal {
  if (!userId || !s) return empty();
  try {
    const raw = s.getItem(key(userId));
    if (!raw) return empty();
    const parsed = JSON.parse(raw) as Partial<WriteJournal>;
    return pruneJournal({ ...empty(), ...parsed, deleted: parsed.deleted || {}, created: parsed.created || {} }, now);
  } catch {
    return empty();
  }
}

function save(userId: string, j: WriteJournal, s: StorageLike | null) {
  if (!s) return;
  try {
    s.setItem(key(userId), JSON.stringify(j));
  } catch {
    /* storage full or blocked: the in-memory reconcile still covers this tab */
  }
}

/** Record an acknowledged write. Call only after the server answered ok. */
export function noteWrite(
  userId: string | null | undefined,
  write: { deletedId?: string; createdId?: string; cashAfter?: number | null },
  s: StorageLike | null = store(),
  now = Date.now()
): WriteJournal {
  if (!userId) return empty();
  const j = readJournal(userId, s, now);
  if (write.deletedId) j.deleted[write.deletedId] = now;
  if (write.createdId) j.created[write.createdId] = now;
  if (typeof write.cashAfter === "number" && Number.isFinite(write.cashAfter)) j.cash = { value: write.cashAfter, at: now };
  j.lastAt = now;
  save(userId, j, s);
  return j;
}

/**
 * Correct a (possibly lagging) server snapshot with the journal. Returns the corrected snapshot
 * and the journal with entries the server already reflects removed.
 */
export function applyJournal(
  snapshot: PortfolioSnapshot,
  journal: WriteJournal,
  now = Date.now()
): { snapshot: PortfolioSnapshot; journal: WriteJournal; corrected: boolean } {
  const j = pruneJournal(journal, now);
  const ids = new Set((snapshot.ledger || []).map((row) => row.id));
  const stillListed = Object.keys(j.deleted).filter((id) => ids.has(id));
  const missingCreated = Object.keys(j.created).filter((id) => !ids.has(id));
  const lagging = stillListed.length > 0 || missingCreated.length > 0;
  let next = snapshot;
  if (stillListed.length) next = { ...next, ledger: next.ledger.filter((row) => !j.deleted[row.id]) };
  const shown = next.kpis?.cash?.value;
  if (lagging && j.cash && typeof shown === "number" && Math.abs(j.cash.value - shown) >= 0.005) {
    next = withCashDelta(next, j.cash.value - shown);
  }
  // The server agrees on a row: that entry is done. Cash stays while any row still lags.
  const settled: WriteJournal = {
    deleted: Object.fromEntries(stillListed.map((id) => [id, j.deleted[id]])),
    created: Object.fromEntries(missingCreated.map((id) => [id, j.created[id]])),
    cash: lagging ? j.cash : null,
    lastAt: j.lastAt,
  };
  return { snapshot: next, journal: settled, corrected: next !== snapshot };
}

export function correctFromJournal(userId: string | null | undefined, snapshot: PortfolioSnapshot, s: StorageLike | null = store(), now = Date.now()) {
  if (!userId) return snapshot;
  const out = applyJournal(snapshot, readJournal(userId, s, now), now);
  save(userId, out.journal, s);
  // b38 G-10: a delete the server has not answered yet stays hidden across a reload.
  const pending = new Set(pendingDeleteIds(userId, s));
  if (!pending.size || !out.snapshot.ledger?.some((row) => pending.has(row.id))) return out.snapshot;
  return { ...out.snapshot, ledger: out.snapshot.ledger.filter((row) => !pending.has(row.id)) };
}

/** Ids the journal says were deleted in the window (seeds the in-tab reconcile after a reload). */
export function journalDeletedMap(userId: string | null | undefined, s: StorageLike | null = store()): Map<string, number> {
  const out = new Map(Object.entries(readJournal(userId, s).deleted));
  for (const w of listPendingWrites(userId, s)) if (w.method === "DELETE" && w.deleteId && !out.has(w.deleteId)) out.set(w.deleteId, w.at);
  return out;
}

/* -------------------------------------------------------------------------- */
/* b37 G-10 (P1): pending writes. A confirmed write is journalled *before* it is sent and cleared */
/* only when the server answers (saved id, or a definite refusal). A reload or closed tab mid-     */
/* request no longer loses it: the next dashboard load replays it with the same idempotency key,  */
/* and the server writes it at most once (route: findIdempotentRow).                              */
/* -------------------------------------------------------------------------- */

export interface PendingWrite {
  key: string;
  userId: string;
  /** b38 G-10: a DELETE carries the ledger row id in deleteId (payload unused). */
  method: "POST" | "DELETE";
  payload: Record<string, unknown>;
  deleteId?: string;
  /** b39 G-10: for a DELETE, the idempotency key of the write that created the row. */
  idem?: string;
  at: number;
}

const PENDING_KEY = "af:pending-writes";
/** A pending write older than this is dropped unsent (and surfaced), never replayed blind. */
export const PENDING_MAX_AGE_MS = 24 * 60 * 60 * 1000;
/** Leave a just-sent write alone: its own request may still be answering in this tab. */
export const PENDING_MIN_AGE_MS = 3_000;
export const WRITE_TIMEOUT_MS = 15_000;
export const WRITE_TIMEOUT_CODE = "write-timeout";
export const WRITE_TIMEOUT_MESSAGE =
  "The server hasn't confirmed this yet, so it isn't shown as saved. Your entry is kept: press Confirm to try again (it can't be recorded twice).";

export function newWriteKey(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return `w-${crypto.randomUUID()}`;
  } catch {
    /* fall through */
  }
  return `w-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function readPending(s: StorageLike | null): PendingWrite[] {
  if (!s) return [];
  try {
    const raw = s.getItem(PENDING_KEY);
    const list = raw ? (JSON.parse(raw) as PendingWrite[]) : [];
    return Array.isArray(list) ? list.filter((w) => w && typeof w.key === "string" && typeof w.userId === "string") : [];
  } catch {
    return [];
  }
}

function savePending(list: PendingWrite[], s: StorageLike | null) {
  if (!s) return;
  try {
    if (list.length) s.setItem(PENDING_KEY, JSON.stringify(list));
    else s.removeItem(PENDING_KEY);
  } catch {
    /* blocked storage: the open dialog still holds the entry */
  }
}

export function journalPendingWrite(w: PendingWrite, s: StorageLike | null = store()): void {
  const list = readPending(s).filter((x) => x.key !== w.key);
  list.push(w);
  savePending(list, s);
}

export function clearPendingWrite(writeKey: string, s: StorageLike | null = store()): void {
  savePending(readPending(s).filter((x) => x.key !== writeKey), s);
}

export function listPendingWrites(userId: string | null | undefined, s: StorageLike | null = store()): PendingWrite[] {
  if (!userId) return [];
  return readPending(s).filter((w) => w.userId === userId);
}

/** 4xx other than 401/408/429 is the server saying no: the write must not be replayed. */
/** b38 G-10: ledger row ids with a DELETE journalled but not yet answered. */
export function pendingDeleteIds(userId: string | null | undefined, s: StorageLike | null = store()): string[] {
  return listPendingWrites(userId, s).flatMap((w) => (w.method === "DELETE" && w.deleteId ? [w.deleteId] : []));
}

export function isDefiniteRefusal(status: number | undefined): boolean {
  if (status == null) return false;
  return status >= 400 && status < 500 && status !== 401 && status !== 408 && status !== 429;
}

export function withWriteTimeout<T extends { ok: boolean }>(work: Promise<T>, ms = WRITE_TIMEOUT_MS): Promise<T | { ok: false; error: string; status?: undefined }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    work,
    new Promise<{ ok: false; error: string }>((resolve) => {
      timer = setTimeout(() => resolve({ ok: false, error: WRITE_TIMEOUT_CODE }), ms);
    }),
  ]).finally(() => timer && clearTimeout(timer));
}

export interface ReplayOutcome {
  saved: string[];
  refused: Array<{ key: string; error: string }>;
  kept: number;
  expired: number;
}

type ApiResult = { ok: boolean; status?: number; error?: unknown; data?: unknown };
type Poster = (payload: Record<string, unknown>) => Promise<ApiResult>;
type Deleter = (id: string, idem?: string) => Promise<ApiResult>;

/**
 * Replay this user's pending writes (same payload, same key). Saved → cleared and noted as created;
 * a definite refusal → cleared and returned so the page can say so; anything else stays for next time.
 */
export async function replayPendingWrites(
  userId: string | null | undefined,
  post: Poster,
  s: StorageLike | null = store(),
  now = Date.now(),
  del?: Deleter
): Promise<ReplayOutcome> {
  const out: ReplayOutcome = { saved: [], refused: [], kept: 0, expired: 0 };
  // b39 G-10: a POST whose row was later deleted (a pending or answered DELETE names its key) is
  // cancelled, never re-sent. The server also tombstones deleted keys (410), which clears it too.
  const cancelled = new Set(listPendingWrites(userId, s).flatMap((w) => (w.method === "DELETE" && w.idem ? [w.idem] : [])));
  for (const w of listPendingWrites(userId, s)) {
    if (w.method !== "DELETE" && (cancelled.has(w.key) || isCancelledWriteKey(w.key, s))) {
      clearPendingWrite(w.key, s);
      out.expired += 1;
      continue;
    }
    if (now - w.at > PENDING_MAX_AGE_MS) {
      clearPendingWrite(w.key, s);
      out.expired += 1;
      continue;
    }
    if (now - w.at < PENDING_MIN_AGE_MS) {
      out.kept += 1;
      continue;
    }
    if (w.method === "DELETE") {
      if (!w.deleteId || !del) {
        out.kept += 1;
        continue;
      }
      let dres: ApiResult;
      try {
        dres = await del(w.deleteId, w.idem);
      } catch {
        out.kept += 1;
        continue;
      }
      // DELETE is idempotent on the server (alreadyRemoved), so a replay is always safe.
      if (dres.ok || dres.status === 404) {
        clearPendingWrite(w.key, s);
        noteWrite(userId, { deletedId: w.deleteId }, s, now);
        out.saved.push(w.deleteId);
      } else if (isDefiniteRefusal(dres.status)) {
        clearPendingWrite(w.key, s);
        out.refused.push({ key: w.key, error: typeof dres.error === "string" ? dres.error : "refused" });
      } else {
        out.kept += 1;
      }
      continue;
    }
    let res: ApiResult;
    try {
      res = await post({ ...w.payload, idempotency_key: w.key, confirm: true });
    } catch {
      out.kept += 1;
      continue;
    }
    const id = (res.data as { lastTransaction?: { _id?: unknown } } | undefined)?.lastTransaction?._id;
    if (res.ok && typeof id === "string" && id) {
      clearPendingWrite(w.key, s);
      noteWrite(userId, { createdId: id, cashAfter: (res.data as { cashBalance?: number } | undefined)?.cashBalance ?? null }, s, now);
      out.saved.push(id);
    } else if (!res.ok && isDefiniteRefusal(res.status)) {
      clearPendingWrite(w.key, s);
      out.refused.push({ key: w.key, error: typeof res.error === "string" ? res.error : "refused" });
    } else {
      out.kept += 1;
    }
  }
  return out;
}

/* b40 G-10 (TT b39 P1 delete-during-pending): an optimistic row has no server id. A delete on it never
   sends DELETE (the server would find nothing); it cancels the write's key in this tab instead, and when
   the POST answers with the saved id, the row is deleted on arrival. */
export const OPTIMISTIC_ID_PREFIX = "optimistic-";
export function isOptimisticId(id: string | null | undefined): boolean {
  return String(id || "").startsWith(OPTIMISTIC_ID_PREFIX);
}
const CANCELLED_KEY = "af:cancelled-writes";
export function cancelWriteKey(writeKey: string, s: StorageLike | null = store()): void {
  if (!writeKey || !s) return;
  try {
    const list = JSON.parse(s.getItem(CANCELLED_KEY) || "[]") as string[];
    if (!list.includes(writeKey)) list.push(writeKey);
    s.setItem(CANCELLED_KEY, JSON.stringify(list.slice(-50)));
  } catch {
    /* blocked storage */
  }
}
export function isCancelledWriteKey(writeKey: string, s: StorageLike | null = store()): boolean {
  if (!writeKey || !s) return false;
  try {
    return (JSON.parse(s.getItem(CANCELLED_KEY) || "[]") as string[]).includes(writeKey);
  } catch {
    return false;
  }
}
export function clearCancelledWriteKey(writeKey: string, s: StorageLike | null = store()): void {
  if (!s) return;
  try {
    const list = (JSON.parse(s.getItem(CANCELLED_KEY) || "[]") as string[]).filter((k) => k !== writeKey);
    if (list.length) s.setItem(CANCELLED_KEY, JSON.stringify(list));
    else s.removeItem(CANCELLED_KEY);
  } catch {
    /* blocked storage */
  }
}
