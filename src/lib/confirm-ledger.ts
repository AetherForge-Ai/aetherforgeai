/**
 * The confirm response includes the full book only when that read finished
 * during the writes. Otherwise it carries the new row and the cash just saved.
 * The ledger on screen keeps its older rows and adds this one.
 */

export interface ConfirmLedgerRow {
  _id?: string;
  type?: string;
  ticker?: string;
}

export interface ConfirmLedgerBody {
  transactions?: ConfirmLedgerRow[];
  cashBalance: number;
  lastTransaction?: ConfirmLedgerRow | null;
  ledgerPartial?: boolean;
  realizedNZD?: number;
  realizedYtd?: number;
  realizedTotal?: number;
  realizedYtdCount?: number;
}

export function mergeConfirmIntoLedger<T extends ConfirmLedgerBody>(current: T | null, incoming: T): T {
  const incomingRows = Array.isArray(incoming.transactions) ? incoming.transactions : [];
  const partial = incoming.ledgerPartial === true || (incomingRows.length <= 1 && !!incoming.lastTransaction);
  if (!partial) return incoming;
  const tx = incoming.lastTransaction;
  // Goal b12 G-10: an optimistic row is replaced by the saved one (or dropped on rollback).
  const rows = (current?.transactions ? [...current.transactions] : []).filter(
    (row) => !(row as { _optimistic?: boolean })._optimistic || (incoming as { optimistic?: boolean }).optimistic
  );
  if (tx && tx._id && !rows.some((row) => row._id === tx._id)) rows.unshift(tx);
  if (!current) {
    return { ...incoming, transactions: rows.length ? rows : incomingRows, ledgerPartial: false };
  }
  return {
    ...current,
    ...incoming,
    transactions: rows,
    cashBalance: incoming.cashBalance,
    ledgerPartial: false,
  };
}
