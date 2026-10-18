import { batchIdForHash, contentHash } from "@/lib/import/hash";
import { IMPORT_TOO_LARGE, textTooLarge } from "@/lib/import/limits";
import { previewImport } from "@/lib/import/plan";
import type { CommitOutcome, ImportPreview, PaperBook, PlanOptions } from "@/lib/import/types";

export const DUPLICATE_FILE = "This file was already imported. Nothing was written. Undo that import first if you want to import it again.";

export function emptyBook(cashNzd = 0): PaperBook {
  return { cashNzd, holdings: {}, fileHashes: [], batches: [] };
}

function addHolding(book: PaperBook, ticker: string, delta: number): void {
  const next = Math.round(((book.holdings[ticker] || 0) + delta) * 1e8) / 1e8;
  if (Math.abs(next) < 1e-8) delete book.holdings[ticker];
  else book.holdings[ticker] = next;
}

/**
 * Save every good row from a preview. A duplicate file is refused as a whole.
 * Bad rows are listed and do not stop the good rows.
 */
export async function commitImport(book: PaperBook, text: string, options: PlanOptions = {}): Promise<CommitOutcome> {
  if (textTooLarge(text || "")) {
    const preview = await previewImport(text, options);
    return { ok: false, error: IMPORT_TOO_LARGE, duplicate: false, preview, batchId: null, written: 0 };
  }
  const fileHash = await contentHash(text);
  if (book.fileHashes.includes(fileHash)) {
    const preview = await previewImport(text, { ...options, held: book.holdings });
    return { ok: false, error: DUPLICATE_FILE, duplicate: true, preview, batchId: null, written: 0 };
  }
  const preview: ImportPreview = await previewImport(text, { ...options, held: book.holdings });
  if (!preview.toWrite.length) {
    return { ok: false, error: preview.error || "Nothing was written.", duplicate: false, preview, batchId: null, written: 0 };
  }
  const holdingDeltas: Record<string, number> = {};
  for (const row of preview.toWrite) {
    const delta = row.side === "buy" ? row.quantity : -row.quantity;
    holdingDeltas[row.ticker] = (holdingDeltas[row.ticker] || 0) + delta;
    addHolding(book, row.ticker, delta);
  }
  book.cashNzd = Math.round((book.cashNzd + preview.cashNzd) * 100) / 100;
  const batchId = batchIdForHash(fileHash);
  book.fileHashes.push(fileHash);
  book.batches.push({ id: batchId, fileHash, cashDeltaNzd: preview.cashNzd, holdingDeltas });
  return { ok: true, error: null, duplicate: false, preview, batchId, written: preview.toWrite.length };
}

/** Put the book back to the totals from before this import. */
export function undoImport(book: PaperBook, batchId: string): { ok: boolean; error: string | null } {
  const at = book.batches.findIndex((batch) => batch.id === batchId);
  if (at < 0) return { ok: false, error: "That import was not found. Nothing was changed." };
  const batch = book.batches[at];
  book.cashNzd = Math.round((book.cashNzd - batch.cashDeltaNzd) * 100) / 100;
  for (const [ticker, delta] of Object.entries(batch.holdingDeltas)) addHolding(book, ticker, -delta);
  book.fileHashes = book.fileHashes.filter((hash) => hash !== batch.fileHash);
  book.batches.splice(at, 1);
  return { ok: true, error: null };
}
