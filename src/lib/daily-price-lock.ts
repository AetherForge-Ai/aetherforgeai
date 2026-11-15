/**
 * One capture at a time. Two runs can both miss the row and both insert a lock;
 * the earlier acquired_at wins and the other run stores nothing.
 * Totalum unique indexes are not documented, so the winner is chosen in code.
 */

export interface CaptureLockRow {
  id: string;
  owner: string;
  acquiredAt: number;
  expiresAt: number;
}

export const CAPTURE_LOCK_TTL_MS = 4 * 60 * 1000;

/** The active row with the earliest acquire time owns the lock. */
export function captureLockWinner(rows: readonly CaptureLockRow[], now: number): CaptureLockRow | null {
  const active = rows.filter((row) => row.expiresAt > now && row.owner);
  active.sort((a, b) => a.acquiredAt - b.acquiredAt || a.id.localeCompare(b.id));
  return active[0] ?? null;
}

export async function acquireCaptureLock(args: {
  list: () => Promise<CaptureLockRow[]>;
  insert: (row: CaptureLockRow) => Promise<void>;
  owner: string;
  now: number;
  ttlMs?: number;
}): Promise<"acquired" | "held"> {
  const ttl = args.ttlMs ?? CAPTURE_LOCK_TTL_MS;
  const holding = captureLockWinner(await args.list(), args.now);
  if (holding) return holding.owner === args.owner ? "acquired" : "held";
  const row: CaptureLockRow = {
    id: `${args.owner}:${args.now}`,
    owner: args.owner,
    acquiredAt: args.now,
    expiresAt: args.now + ttl,
  };
  await args.insert(row);
  const winner = captureLockWinner(await args.list(), args.now);
  if (!winner || winner.owner !== args.owner || winner.acquiredAt !== args.now) return "held";
  return "acquired";
}
