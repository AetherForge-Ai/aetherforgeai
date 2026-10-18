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
  return out.snapshot;
}

/** Ids the journal says were deleted in the window (seeds the in-tab reconcile after a reload). */
export function journalDeletedMap(userId: string | null | undefined, s: StorageLike | null = store()): Map<string, number> {
  return new Map(Object.entries(readJournal(userId, s).deleted));
}
