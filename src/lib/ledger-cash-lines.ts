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
  if (type === "tax" || type === "withdraw") return -magnitude;
  if (type === "dividend" || type === "deposit") return magnitude;
  return Number.isFinite(amount) ? amount : 0;
}

function finiteNum(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * The cash figure shown on the dashboard ledger card and on each ledger row.
 * Both surfaces must call this so a fee or a missing sign cannot make them disagree.
 * Withdraw and tax are reductions. A zero total falls back to the stored quantity
 * (cash lines record the amount there) so a withdrawal is not shown as +NZ$0.00.
 * When cash_nzd and total differ, the larger magnitude is the one that includes brokerage.
 */
export function ledgerDisplayedCash(row: {
  type?: string | null;
  total?: number | null;
  cash_nzd?: number | null;
  fees_nzd?: number | null;
  quantity?: number | null;
}): number {
  const type = String(row.type || "");
  const total = finiteNum(row.total);
  const cash = finiteNum(row.cash_nzd);
  const fee = Math.abs(finiteNum(row.fees_nzd) ?? 0);
  const qty = Math.abs(finiteNum(row.quantity) ?? 0);

  if (type === "withdraw" || type === "tax") {
    const mag = Math.max(Math.abs(total ?? 0), Math.abs(cash ?? 0));
    if (mag > 0) return -mag;
    return qty > 0 ? -qty : 0;
  }
  if (type === "opening_balance") {
    return Math.max(Math.abs(total ?? 0), Math.abs(cash ?? 0));
  }
  if (type === "dividend" || type === "deposit") {
    const mag = Math.max(Math.abs(total ?? 0), Math.abs(cash ?? 0));
    if (mag > 0) return mag;
    return qty > 0 ? qty : 0;
  }
  if (type === "correction") return 0;

  let signed = cash ?? total ?? 0;
  if (cash != null && total != null && Math.abs(Math.abs(cash) - Math.abs(total)) > 0.009) {
    signed = Math.abs(cash) >= Math.abs(total) ? cash : total;
  } else if (cash == null && total != null && fee > 0 && (type === "buy" || type === "sell")) {
    const mag = Math.abs(total);
    signed = type === "sell" ? mag - fee : -(mag + fee);
  }
  return displayedCashImpact(type, signed);
}

export function ledgerSections(rows: LedgerRowLike[]): { dividends: LedgerRowLike[]; tax: LedgerRowLike[] } {
  return {
    dividends: rows.filter((r) => r.type === "dividend"),
    tax: rows.filter((r) => r.type === "tax"),
  };
}
