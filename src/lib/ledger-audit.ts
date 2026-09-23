/**
 * Quote + fill audit log (in-memory ring + structured console).
 * Persisted snapshots can be appended to transaction.notes / holding.notes.
 */

export interface AuditEvent {
  at: string; // ISO UTC
  at_nz: string;
  action: string;
  ticker?: string;
  userId?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  quote?: { source: string; price: number; as_at: string };
  meta?: Record<string, unknown>;
}

const RING: AuditEvent[] = [];
const RING_MAX = 500;

export function aucklandStamp(d = new Date()): string {
  return new Intl.DateTimeFormat("en-NZ", {
    timeZone: "Pacific/Auckland",
    dateStyle: "short",
    timeStyle: "medium",
  }).format(d);
}

export function logLedgerAudit(ev: Omit<AuditEvent, "at" | "at_nz"> & { at?: string }): AuditEvent {
  const now = new Date();
  const full: AuditEvent = {
    ...ev,
    at: ev.at || now.toISOString(),
    at_nz: aucklandStamp(now),
  };
  RING.push(full);
  if (RING.length > RING_MAX) RING.shift();
  console.log(`[ledger-audit] ${full.action}`, JSON.stringify(full));
  return full;
}

export function getRecentAudit(limit = 50): AuditEvent[] {
  return RING.slice(-limit);
}

/** Append a compact audit line into notes (keeps originals). */
export function appendAuditNote(existing: string | null | undefined, line: string): string {
  const base = (existing || "").trim();
  const stamp = aucklandStamp();
  const entry = `[audit ${stamp}] ${line}`;
  const next = base ? `${base}\n${entry}` : entry;
  return next.slice(0, 4000);
}
