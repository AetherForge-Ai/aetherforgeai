/**
 * Import confirm and undo.
 * Each trade row is written, then its cash update. A failed cash update deletes that row by id.
 * Rows are not started together. The batch id is a note stamp, like idem=.
 */

import type { ImportWriteStep } from "@/lib/broker-import";

export interface ImportCommitTrade {
  id: string;
  pendingCash: number;
  previousCash: number;
  restoreHolding?: () => Promise<void>;
}

export interface ImportCommitIO {
  writeTrade: (step: ImportWriteStep) => Promise<ImportCommitTrade>;
  writeCash: (step: ImportWriteStep, trade: ImportCommitTrade) => Promise<void>;
  rollbackTrade: (trade: ImportCommitTrade) => Promise<void>;
}

export interface ImportCommitResult {
  written: ImportCommitTrade[];
  error: string | null;
  rolledBack: string | null;
}

/** One row at a time: ledger id first, then cash. Cash failure deletes that id and stops. */
export async function commitImportInOrder(steps: readonly ImportWriteStep[], io: ImportCommitIO): Promise<ImportCommitResult> {
  const written: ImportCommitTrade[] = [];
  // b85 H-10: all or nothing. On any failure every row already saved by this commit is removed,
  // newest first, and its cash restored, so a failed commit leaves nothing behind.
  const unwind = async (): Promise<void> => {
    for (const done of [...written].reverse()) {
      try {
        await io.rollbackTrade(done);
      } catch (err) {
        console.error("[import-commit] rollback failed:", err);
      }
    }
  };
  for (const step of steps) {
    let trade: ImportCommitTrade;
    try {
      trade = await io.writeTrade(step);
    } catch (err) {
      await unwind();
      return {
        written: [],
        error: err instanceof Error ? err.message : "The import was not saved.",
        rolledBack: null,
      };
    }
    try {
      await io.writeCash(step, trade);
    } catch (err) {
      await io.rollbackTrade(trade);
      await unwind();
      return {
        written: [],
        error: err instanceof Error ? err.message : "The cash update failed.",
        rolledBack: trade.id,
      };
    }
    written.push(trade);
  }
  return { written, error: null, rolledBack: null };
}

export function newImportBatchId(): string {
  const bytes = new Uint8Array(8);
  const cryptoObj = globalThis.crypto;
  // H-10: Web Crypto only. Node 18+, browsers and Workers all provide it.
  if (!cryptoObj?.getRandomValues) throw new Error("Secure random is not available.");
  cryptoObj.getRandomValues(bytes);
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `imp${hex}`;
}

/** Keep any idem= stamp already on the note, and add the batch id and broker ref. */
export function stampImportNote(notes: string, batchId: string, brokerRef: string): string {
  let next = String(notes || "").trim();
  const batch = batchId.trim();
  if (batch) {
    const token = `batch=${batch}`;
    if (!next.includes(token)) next = `${next} ${token}`.trim();
  }
  const ref = brokerRef.trim().replace(/\s+/g, "");
  if (ref) {
    const token = `ref=${ref}`;
    if (!next.includes(token)) next = `${next} ${token}`.trim();
  }
  return next;
}

/**
 * Goal b8 H-10: SHA-256 of the file text (line endings and a BOM normalised),
 * first 16 hex characters. Stamped as file=<hash> on every imported row so a
 * second upload of the same file is refused before anything is written.
 */
export async function importFileHash(text: string): Promise<string> {
  const normalised = String(text || "").replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").trim();
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalised));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}

export function stampFileHash(notes: string, fileHash: string): string {
  const token = `file=${fileHash}`;
  const next = String(notes || "").trim();
  return !fileHash || next.includes(token) ? next : `${next} ${token}`.trim();
}

export function notesHaveFile(notes: string | null | undefined, fileHash: string): boolean {
  return Boolean(fileHash) && new RegExp(`(?:^|\\s)file=${fileHash}(?:\\s|$)`).test(String(notes || ""));
}

export const IMPORT_DUPLICATE_FILE = "This file was already imported. Nothing was written. Undo that import first if you want to import it again.";

export function notesHaveBatch(notes: string | null | undefined, batchId: string): boolean {
  const id = batchId.trim();
  if (!id) return false;
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|\\s)batch=${escaped}(?:\\s|$)`).test(String(notes || ""));
}

export async function undoImportInOrder(
  ids: readonly string[],
  apply: (id: string) => Promise<void>
): Promise<{ undone: string[]; error: string | null }> {
  const undone: string[] = [];
  for (const id of ids) {
    if (!id) continue;
    try {
      await apply(id);
    } catch (err) {
      return { undone, error: err instanceof Error ? err.message : "Undo stopped." };
    }
    undone.push(id);
  }
  return { undone, error: null };
}

export interface ColumnMapStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function columnMapStorageKey(broker: string): string {
  const name = (broker || "generic").trim().toLowerCase() || "generic";
  return `af-import-column-map:${name}`;
}

const MAP_KEYS = ["date", "ticker", "side", "quantity", "price", "fee", "currency", "fx", "value"] as const;

export function readSavedColumnMap(store: ColumnMapStore, broker: string): Record<string, string> | null {
  let raw = "";
  try {
    raw = store.getItem(columnMapStorageKey(broker)) || "";
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") return null;
    const mapping: Record<string, string> = {};
    for (const key of MAP_KEYS) {
      const value = parsed[key];
      if (typeof value === "string" && value.trim()) mapping[key] = value;
    }
    return Object.keys(mapping).length ? mapping : null;
  } catch {
    return null;
  }
}

export function writeSavedColumnMap(store: ColumnMapStore, broker: string, mapping: Record<string, string>): void {
  const body: Record<string, string> = {};
  for (const key of MAP_KEYS) {
    const value = mapping[key];
    if (typeof value === "string" && value.trim()) body[key] = value;
  }
  try {
    store.setItem(columnMapStorageKey(broker), JSON.stringify(body));
  } catch {
    /* A full browser store must not block the review. */
  }
}
