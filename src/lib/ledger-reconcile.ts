/**
 * b28 G-10: read-after-write for the ledger. For a short window after a write, a server
 * snapshot can lag (Totalum read lag, another isolate): it may still hold a row just deleted,
 * or miss a row just added, or arrive empty. Within the window the shown ledger is
 *   server rows minus rows deleted here, plus on-screen rows the server did not return yet.
 * Outside the window the server's ledger is used as is.
 */
// b32 G-10: TT saw store lag up to ~17 s after a delete; 45 s covers it with margin.
export const RECONCILE_WINDOW_MS = 45_000;

export type LedgerLike = { id: string };

export function reconcileLedger<T extends LedgerLike>(
  incoming: readonly T[],
  onScreen: readonly T[] | null | undefined,
  deletedAt: ReadonlyMap<string, number>,
  lastMutationAt: number,
  now = Date.now()
): T[] {
  if (now - lastMutationAt > RECONCILE_WINDOW_MS) return [...incoming];
  const deleted = (id: string) => {
    const at = deletedAt.get(id);
    return at != null && now - at <= RECONCILE_WINDOW_MS;
  };
  const out = incoming.filter((row) => !deleted(row.id));
  const have = new Set(out.map((row) => row.id));
  for (const row of onScreen || []) {
    if (!have.has(row.id) && !deleted(row.id) && !row.id.startsWith("pending-")) out.push(row);
  }
  return out;
}
