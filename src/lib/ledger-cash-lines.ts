/**
 * Dividend and tax lines on the paper ledger.
 * Cash moves by the recorded amount. Holdings quantities do not.
 * Net worth stays cash plus holdings.
 */

export interface LedgerBook {
  cashNZD: number;
  holdingsNZD: number;
  quantities: Record<string, number>;
}

export interface CashLine {
  type: "dividend" | "tax";
  amountNZD: number;
  note?: string;
}

export interface LedgerRowLike {
  type: string;
  amountNZD?: number;
  total?: number;
  asset_name?: string;
  notes?: string;
  executed_at?: string;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function netWorthOf(book: LedgerBook): number {
  return round2(book.cashNZD + book.holdingsNZD);
}

function sameQuantities(a: Record<string, number>, b: Record<string, number>): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if ((a[key] || 0) !== (b[key] || 0)) return false;
  }
  return true;
}

export function applyCashLine(book: LedgerBook, line: CashLine): LedgerBook {
  const amount = round2(Math.abs(line.amountNZD));
  if (!(amount > 0)) throw new Error("Amount must be greater than 0");
  const delta = line.type === "dividend" ? amount : -amount;
  if (line.type === "tax" && amount > book.cashNZD + 1e-6) {
    throw new Error("Insufficient cash balance for this tax line");
  }
  const next: LedgerBook = {
    cashNZD: round2(book.cashNZD + delta),
    holdingsNZD: book.holdingsNZD,
    quantities: { ...book.quantities },
  };
  if (!sameQuantities(book.quantities, next.quantities)) {
    throw new Error("Holdings quantities must stay put");
  }
  return next;
}

/**
 * Cash shown on a ledger row. A tax line is a reduction even when the stored
 * total was saved without a sign. A dividend stays an increase.
 */
export function displayedCashImpact(type: string, total: number | null | undefined): number {
  const amount = Number(total);
  const magnitude = Number.isFinite(amount) ? Math.abs(amount) : 0;
  if (type === "tax") return -magnitude;
  if (type === "dividend") return magnitude;
  return Number.isFinite(amount) ? amount : 0;
}

export function ledgerSections(rows: LedgerRowLike[]): { dividends: LedgerRowLike[]; tax: LedgerRowLike[] } {
  return {
    dividends: rows.filter((r) => r.type === "dividend"),
    tax: rows.filter((r) => r.type === "tax"),
  };
}
