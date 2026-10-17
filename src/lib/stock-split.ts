/**
 * Goal b9 H-9: record an N:1 share split.
 *
 * A split is stored as a ledger "correction" row (no cash moves) whose notes
 * carry `[SPLIT:r=<ratio>;d=<YYYY-MM-DD>]`. The holding is set to
 * shares × ratio at average cost ÷ ratio, so the NZ$ cost is unchanged.
 * The tax loaders read the tag and feed every earlier buy and sell through
 * splitAdjustedRows, so FIFO lots line up with the post-split share count.
 */
import { splitAdjustedRows } from "@/lib/tax-scenarios";

const SPLIT_RE = /\[SPLIT:r=([0-9.]+);d=(\d{4}-\d{2}-\d{2})\]/;

export interface SplitTag {
  ratio: number;
  date: string;
}

export function splitNote(ratio: number, date: string): string {
  return `[SPLIT:r=${ratio};d=${date}] Share split ${ratio}:1`;
}

export function readSplit(notes: string | null | undefined): SplitTag | null {
  const m = SPLIT_RE.exec(String(notes || ""));
  if (!m) return null;
  const ratio = Number(m[1]);
  if (!(ratio > 0) || ratio === 1) return null;
  return { ratio, date: m[2] };
}

/** Validation for the split entry screen and API. Returns an error or null. */
export function splitInputError(input: { ticker?: string; ratio?: number; date?: string; sharesHeld?: number }): string | null {
  if (!String(input.ticker || "").trim()) return "Pick the holding that split.";
  const ratio = Number(input.ratio);
  if (!Number.isFinite(ratio) || ratio <= 0) return "The split ratio must be greater than 0.";
  if (ratio === 1) return "A 1:1 split changes nothing.";
  if (ratio > 1000) return "The split ratio must be 1000 or less.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(input.date || ""))) return "Enter the split date.";
  if (!(Number(input.sharesHeld) > 0)) return "You don't hold any of this to split.";
  return null;
}

/** Holding after an N:1 split: shares × ratio, average ÷ ratio, NZ$ cost unchanged. */
export function holdingAfterSplit(shares: number, averageCost: number, ratio: number): { shares: number; averageCost: number } {
  const r6 = (n: number) => Math.round((n + Number.EPSILON) * 1e6) / 1e6;
  return { shares: r6(shares * ratio), averageCost: r6(averageCost / ratio) };
}

type Row = { type?: string | null; ticker?: string | null; notes?: string | null; quantity?: number | null; price?: number | null; trade_date?: string | null; executed_at?: string | null };

/** Apply every recorded split (oldest first) to the tax rows. */
export function applyLedgerSplits<T extends Row>(rows: readonly T[]): T[] {
  const splits = rows
    .map((row) => ({ row, tag: row.type === "correction" ? readSplit(row.notes) : null }))
    .filter((x): x is { row: T; tag: SplitTag } => x.tag != null && !!x.row.ticker)
    .sort((a, b) => a.tag.date.localeCompare(b.tag.date));
  let out = [...rows];
  for (const { row, tag } of splits) {
    out = splitAdjustedRows(out as never, String(row.ticker), tag.date, tag.ratio) as unknown as T[];
  }
  return out;
}
