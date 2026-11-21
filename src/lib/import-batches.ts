/**
 * Import batches already on a member's ledger.
 * The batch id lives in the notes stamp (batch=imp…). No extra table.
 */

export type ImportBatchStatus = "active" | "undone";

export interface ImportBatchSummary {
  batchId: string;
  /** Newest row time on the batch (createdAt, otherwise the trade date). */
  date: string;
  broker: string;
  rows: number;
  status: ImportBatchStatus;
}

export interface ImportBatchRow {
  notes?: string | null;
  executed_at?: string | null;
  createdAt?: string | null;
  broker?: string | null;
}

const BATCH_ID = /(?:^|\s)batch=(imp[0-9a-f]+)(?:\s|$)/i;
const FROM_FILE = /Imported from an? (.+?) file/i;

function batchIdOf(notes: string | null | undefined): string {
  return BATCH_ID.exec(String(notes || ""))?.[1]?.toLowerCase() || "";
}

function whenOf(row: ImportBatchRow): string {
  return String(row.createdAt || row.executed_at || "");
}

function brokerOf(row: ImportBatchRow): string {
  const field = String(row.broker || "").trim();
  if (field && field !== "file") return field;
  const named = FROM_FILE.exec(String(row.notes || ""))?.[1]?.trim();
  return named || field || "broker";
}

/** Active batches still on the book, newest first. Undone batches have no rows left. */
export function listImportBatches(rows: readonly ImportBatchRow[], limit = 8): ImportBatchSummary[] {
  const groups = new Map<string, ImportBatchSummary>();
  for (const row of rows) {
    const batchId = batchIdOf(row.notes);
    if (!batchId) continue;
    const date = whenOf(row);
    const current = groups.get(batchId);
    if (!current) {
      groups.set(batchId, { batchId, date, broker: brokerOf(row), rows: 1, status: "active" });
      continue;
    }
    current.rows += 1;
    if (date > current.date) current.date = date;
    if (current.broker === "broker") current.broker = brokerOf(row);
  }
  return [...groups.values()].sort((a, b) => b.date.localeCompare(a.date) || b.batchId.localeCompare(a.batchId)).slice(0, limit);
}

/**
 * Which batch the Undo button acts on.
 * A remembered id is used only when that batch is still active. Otherwise the newest active batch.
 * An undone batch, or an empty book, has no target.
 */
export function undoTarget(batches: readonly ImportBatchSummary[], remembered?: string | null): string {
  const active = batches.filter((batch) => batch.status === "active");
  const kept = String(remembered || "").trim();
  if (kept && active.some((batch) => batch.batchId === kept)) return kept;
  return active[0]?.batchId || "";
}
