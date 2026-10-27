/**
 * b87 H-10: import undo is planned for the whole batch before anything is deleted.
 * Trades are reversed newest first; funding rows (deposit, withdrawal, opening balance) go last.
 * Every step is simulated with the same reversal rules the apply path uses, so a batch that
 * passes here is not refused row by row. A batch that fails changes nothing. Pure (no network).
 */
import { planLedgerReversal, type ReversalTxn } from "@/lib/ledger-reversal";
import { strandedImportDeposit } from "@/lib/import-stranded";
import { notesHaveBatch } from "@/lib/import-commit";

const FUNDING = new Set(["deposit", "withdrawal", "opening_balance"]);
const round2 = (n: number) => Math.round(n * 100) / 100;

export const UNDO_NOT_FOUND = "That import was not found. Nothing was changed.";

export function isFundingRow(row: Pick<ReversalTxn, "type">): boolean {
  return FUNDING.has(String(row.type || "").toLowerCase());
}

const when = (row: ReversalTxn) => String(row.executed_at || row.createdAt || "");

/** Trades newest first (ties: later id first), then funding rows newest first. */
export function orderImportUndo(rows: readonly ReversalTxn[]): ReversalTxn[] {
  const newestFirst = (a: ReversalTxn, b: ReversalTxn) => when(b).localeCompare(when(a)) || String(b._id).localeCompare(String(a._id));
  const trades = rows.filter((r) => !isFundingRow(r)).sort(newestFirst);
  const funding = rows.filter((r) => isFundingRow(r)).sort(newestFirst);
  return [...trades, ...funding];
}

export type ImportUndoPlan =
  | { ok: true; ids: string[]; cashBefore: number; cashAfter: number }
  | { ok: false; error: string; ids: string[] };

export function planImportUndo(input: { ledger: readonly ReversalTxn[]; batchId: string; cashNzd: number }): ImportUndoPlan {
  const batchId = input.batchId.trim();
  const mine = batchId ? input.ledger.filter((r) => r._id && notesHaveBatch(r.notes, batchId)) : [];
  return planUndoRows(input.ledger, mine, input.cashNzd);
}

/** Import rows (any batch= tag) among the given ids. Used by the test-hook cleanup only. */
export function importRowsByIds(ledger: readonly ReversalTxn[], ids: readonly string[]): ReversalTxn[] {
  const want = new Set(ids.map((v) => String(v).trim()).filter(Boolean));
  return ledger.filter((r) => r._id && want.has(String(r._id)) && /(?:^|\s)batch=imp[0-9a-f]+(?:\s|$)/.test(String(r.notes || "")));
}

export function planUndoRows(ledger: readonly ReversalTxn[], mine: readonly ReversalTxn[], cashNzd: number): ImportUndoPlan {
  const input = { ledger, cashNzd };
  if (!mine.length) return { ok: false, error: UNDO_NOT_FOUND, ids: [] };
  const ordered = orderImportUndo(mine);
  const ids = ordered.map((r) => String(r._id));
  let remaining = input.ledger.filter((r) => r?._id);
  let cash = round2(Number(input.cashNzd) || 0);
  const cashBefore = cash;
  for (const row of ordered) {
    const plan = planLedgerReversal("", row, remaining, null);
    if (plan.blockedReason) {
      return { ok: false, ids, error: `${plan.blockedReason} Nothing was changed.` };
    }
    let next = round2(cash + plan.cashDeltaNzd);
    if (next < -0.009 && strandedImportDeposit(row, remaining)) next = cash;
    if (next < -0.009) {
      return {
        ok: false,
        ids,
        error: `Undoing this import would take cash to NZ$${next.toFixed(2)}. Remove or edit the later trades that used this cash first. Nothing was changed.`,
      };
    }
    cash = next;
    remaining = remaining.filter((r) => r._id !== row._id);
  }
  return { ok: true, ids, cashBefore, cashAfter: cash };
}
