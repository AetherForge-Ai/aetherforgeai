/**
 * Read-only ledger load for the accountant pack.
 * Pages the whole book, oldest execution time first. No create, edit or delete.
 * Share with accountant is future work and is not implemented here.
 */
import "server-only";
import { ACCOUNTANT_LEDGER_SORT, ACCOUNTANT_PAGE_SIZE, ACCOUNTANT_ROW_CEILING, orderLedgerRows, type AccountantLedgerRow } from "@/lib/accountant-export";
import { totalumSdk } from "@/lib/totalum";

function asText(value: unknown): string {
  if (value == null || value === "") return "";
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? "" : value.toISOString();
  return String(value);
}

function mapRows(data: unknown): AccountantLedgerRow[] {
  const rows = Array.isArray(data) ? (data as AccountantLedgerRow[]) : [];
  return rows.map((row) => ({
    ...row,
    executed_at: asText(row.executed_at),
    createdAt: asText(row.createdAt),
    trade_date: asText(row.trade_date),
    trade_datetime: asText(row.trade_datetime),
    fx_timestamp: asText(row.fx_timestamp),
  }));
}

export interface AccountantLedgerLoad {
  rows: AccountantLedgerRow[];
  /** True when the 50,000-row ceiling stopped the read before a short page. */
  truncated: boolean;
}

/** Every page of this account's transactions, up to the ceiling. Does not write. */
export async function loadAccountantLedger(userId: string): Promise<AccountantLedgerLoad> {
  if (!userId) return { rows: [], truncated: false };
  const collected: AccountantLedgerRow[] = [];
  let offset = 0;
  let truncated = false;
  while (collected.length < ACCOUNTANT_ROW_CEILING) {
    const res = await totalumSdk.crud.query("transaction", {
      _filter: { user: userId },
      _sort: ACCOUNTANT_LEDGER_SORT,
      _limit: ACCOUNTANT_PAGE_SIZE,
      _offset: offset,
    });
    const page = mapRows(res?.data);
    if (page.length === 0) break;
    const room = ACCOUNTANT_ROW_CEILING - collected.length;
    collected.push(...page.slice(0, room));
    if (page.length < ACCOUNTANT_PAGE_SIZE) break;
    offset += page.length;
    if (collected.length >= ACCOUNTANT_ROW_CEILING) {
      truncated = true;
      break;
    }
  }
  return { rows: orderLedgerRows(collected), truncated };
}
