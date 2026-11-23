/**
 * Read-only ledger load for the accountant pack.
 * The sort and the total happen in Totalum. No create, edit or delete.
 * Share with accountant is future work and is not implemented here.
 */
import "server-only";
import { ACCOUNTANT_LEDGER_SORT, ACCOUNTANT_ROW_CAP, type AccountantLedgerRow } from "@/lib/accountant-export";
import { totalumSdk } from "@/lib/totalum";

function asText(value: unknown): string {
  if (value == null || value === "") return "";
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? "" : value.toISOString();
  return String(value);
}

type QueryOptions = {
  _filter: { user: string };
  _sort: typeof ACCOUNTANT_LEDGER_SORT;
  _limit: number;
  _offset?: number;
  _count?: true;
  _select?: { _id: true };
};

function mapRows(data: unknown): AccountantLedgerRow[] {
  const rows = Array.isArray(data) ? (data as AccountantLedgerRow[]) : [];
  return rows.map((row) => {
    const { _count: _ignored, ...rest } = row as AccountantLedgerRow & { _count?: unknown };
    return {
      ...rest,
      executed_at: asText(rest.executed_at) || asText(rest.createdAt),
      createdAt: asText(rest.createdAt),
      trade_date: asText(rest.trade_date),
      trade_datetime: asText(rest.trade_datetime),
      fx_timestamp: asText(rest.fx_timestamp),
    };
  });
}

/** `_count._total` is the number of matching rows before `_limit`. Absent when the query did not return it. */
export function totalFromCount(data: unknown): number | null {
  if (!Array.isArray(data) || data.length === 0) return null;
  const raw = (data[0] as { _count?: { _total?: unknown } } | null)?._count?._total;
  const total = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(total) && total >= 0 ? total : null;
}

async function queryLedger(options: QueryOptions) {
  return totalumSdk.crud.query("transaction", options);
}

/** Pages with `_offset` when `_count._total` is not available. Stops on a short page. */
export async function countLedgerByOffset(userId: string, pageSize = 1000): Promise<number> {
  let total = 0;
  let offset = 0;
  for (let page = 0; page < 200; page += 1) {
    const res = await queryLedger({
      _filter: { user: userId },
      _sort: ACCOUNTANT_LEDGER_SORT,
      _limit: pageSize,
      _offset: offset,
      _select: { _id: true },
    });
    const n = Array.isArray(res?.data) ? res.data.length : 0;
    total += n;
    if (n < pageSize) return total;
    offset += n;
  }
  return total;
}

export interface AccountantLedgerLoad {
  rows: AccountantLedgerRow[];
  /** Matching rows on the account, from `_count._total` or an offset count. */
  total: number;
}

/** This user's newest ledger rows, capped. Does not write. */
export async function loadAccountantLedger(userId: string, cap = ACCOUNTANT_ROW_CAP): Promise<AccountantLedgerLoad> {
  if (!userId) return { rows: [], total: 0 };
  const base = { _filter: { user: userId }, _sort: ACCOUNTANT_LEDGER_SORT, _limit: cap };
  let res: { data?: unknown } | undefined;
  try {
    res = await queryLedger({ ...base, _count: true });
  } catch {
    res = await queryLedger(base);
  }
  const rows = mapRows(res?.data);
  const counted = totalFromCount(res?.data);
  if (counted != null) return { rows, total: counted };
  if (rows.length < cap) return { rows, total: rows.length };
  return { rows, total: await countLedgerByOffset(userId) };
}
