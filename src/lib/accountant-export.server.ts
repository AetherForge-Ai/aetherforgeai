/**
 * Read-only ledger load for the accountant pack.
 * Queries this account's transaction rows. No create, edit or delete.
 * Share with accountant is future work and is not implemented here.
 */
import "server-only";
import { ACCOUNTANT_READ_LIMIT, type AccountantLedgerRow } from "@/lib/accountant-export";
import { totalumSdk } from "@/lib/totalum";

function asText(value: unknown): string {
  if (value == null || value === "") return "";
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? "" : value.toISOString();
  return String(value);
}

/** This user's ledger rows. One past the pack cap, so a full book can be told apart. Does not write. */
export async function loadAccountantLedger(userId: string): Promise<AccountantLedgerRow[]> {
  if (!userId) return [];
  const res = await totalumSdk.crud.query("transaction", {
    _filter: { user: userId },
    _limit: ACCOUNTANT_READ_LIMIT,
  });
  const rows = (res?.data as unknown as AccountantLedgerRow[]) || [];
  return rows.map((row) => ({
    ...row,
    executed_at: asText(row.executed_at) || asText(row.createdAt),
    createdAt: asText(row.createdAt),
    trade_date: asText(row.trade_date),
    trade_datetime: asText(row.trade_datetime),
    fx_timestamp: asText(row.fx_timestamp),
  }));
}
