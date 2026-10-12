/**
 * FIFO figures for the ledger, holdings, CSV and the recompute dry-run.
 * Nothing here writes a database row.
 */

import { formatDisplayDate, formatSignedMoney, roundMoney } from "@/lib/currency";
import { formatLedgerDateTime, isUnknownClock } from "@/lib/executed-at";
import { buyLotDay, COST_METHOD_LABEL, ledgerDisplayWhen, movementHasClock } from "@/lib/lot-day";
import { allRealisedLines, fifoRemainingUnitCosts, type RealisedLine } from "@/lib/tax-realised";
import type { TaxLedgerRow } from "@/lib/taxable-income";

export { COST_METHOD_LABEL };

export function applyFifoPurchasePrices<T extends { ticker?: string | null; purchase_price?: number | null }>(
  holdings: T[],
  rows: readonly TaxLedgerRow[]
): T[] {
  const costs = fifoRemainingUnitCosts(rows);
  return holdings.map((holding) => {
    const key = String(holding.ticker || "").trim().toUpperCase();
    const unit = costs.get(key);
    if (!(typeof unit === "number" && unit > 0)) return holding;
    return { ...holding, purchase_price: unit };
  });
}

export function fifoTotals(
  rows: readonly TaxLedgerRow[],
  calendarYear: number
): { ytd: number; ytdCount: number; all: number; allCount: number } {
  const lines = allRealisedLines(rows);
  const counted = lines.filter((line) => line.realisedNzd != null);
  const ytdLines = counted.filter((line) => line.when.startsWith(String(calendarYear)));
  const sum = (list: RealisedLine[]) => roundMoney(list.reduce((total, line) => total + (line.realisedNzd ?? 0), 0));
  return { ytd: sum(ytdLines), ytdCount: ytdLines.length, all: sum(counted), allCount: counted.length };
}

function sellQueues(rows: readonly TaxLedgerRow[]): Map<string, RealisedLine[]> {
  const queues = new Map<string, RealisedLine[]>();
  for (const line of allRealisedLines(rows)) {
    const key = `${line.ticker}|${line.when}`;
    const list = queues.get(key) || [];
    list.push(line);
    queues.set(key, list);
  }
  return queues;
}

function chronological<T extends TaxLedgerRow>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => {
    const day = buyLotDay(a).localeCompare(buyLotDay(b));
    if (day) return day;
    const type = String(a.type || "").localeCompare(String(b.type || ""));
    if (type) return type;
    return String(a._id || "").localeCompare(String(b._id || ""));
  });
}

/** FIFO realised NZ$ for each sell id. Null when the lot or the rate is incomplete. */
export function fifoRealisedById(rows: readonly TaxLedgerRow[]): Map<string, number | null> {
  const ordered = chronological(rows);
  const queues = sellQueues(ordered);
  const map = new Map<string, number | null>();
  for (const row of ordered) {
    if (row.type !== "sell") continue;
    const id = String(row._id || "");
    if (!id) continue;
    const ticker = String(row.ticker || "").trim().toUpperCase();
    const line = queues.get(`${ticker}|${buyLotDay(row)}`)?.shift();
    map.set(id, line?.realisedNzd ?? null);
  }
  return map;
}

/** Replace a sell row's stored realised figure with the FIFO read. Does not persist. */
export function applyFifoToLedgerRows<T extends { _id?: string; type?: string | null; realized_pnl?: number | null }>(
  recent: readonly T[],
  book: readonly TaxLedgerRow[]
): T[] {
  const byId = fifoRealisedById(book);
  return recent.map((row) => {
    if (row.type !== "sell" || !row._id) return row;
    const fifo = byId.get(String(row._id));
    if (fifo == null) return row;
    return { ...row, realized_pnl: fifo };
  });
}

export interface BackdatedTrade {
  date: string;
  ticker: string;
  side: string;
  quantity: number;
  price: number;
  currency?: string;
  fx?: number;
}

/**
 * When a new fill is dated before an existing sell, FIFO rematches that sell.
 * The note names each earlier sell whose realised figure would change.
 */
export function backdatedRealisedNote(existing: readonly TaxLedgerRow[], incoming: readonly BackdatedTrade[]): string | null {
  const trades = incoming.filter((row) => row.side === "buy" || row.side === "sell");
  if (!trades.length || !existing.some((row) => row.type === "sell" && row._id)) return null;
  const before = fifoRealisedById(existing);
  const added: TaxLedgerRow[] = trades.map((trade, index) => ({
    _id: `incoming-${index}`,
    type: trade.side,
    ticker: trade.ticker,
    asset_type: "stock",
    executed_at: trade.date,
    quantity: trade.quantity,
    price: trade.price,
    currency: trade.currency || "NZD",
    fx_rate: trade.currency && trade.currency !== "NZD" ? trade.fx ?? null : 1,
    fees_nzd: 0,
  }));
  const after = fifoRealisedById([...existing, ...added]);
  const changes: string[] = [];
  for (const row of existing) {
    if (row.type !== "sell" || !row._id) continue;
    const id = String(row._id);
    const prev = before.get(id);
    const next = after.get(id);
    if (prev == null && next == null) continue;
    if (prev != null && next != null && Math.abs(prev - next) < 0.005) continue;
    const ticker = String(row.ticker || "").trim().toUpperCase();
    const day = buyLotDay(row);
    const was = prev == null ? "blank" : formatSignedMoney(prev);
    const would = next == null ? "blank" : formatSignedMoney(next);
    changes.push(`${ticker} on ${formatDisplayDate(day)} was ${was} and would be ${would}`);
  }
  if (!changes.length) return null;
  const shown = changes.slice(0, 8);
  const more = changes.length > shown.length ? ` ${changes.length - shown.length} more sells would also change.` : "";
  return `This file is dated before an earlier sell. FIFO matches oldest lots first, so earlier realised figures change: ${shown.join("; ")}.${more}`;
}

/** Copy FIFO price, FX and total onto sell rows for the CSV. Does not persist. */
export function attachFifoRealised<T extends TaxLedgerRow>(rows: readonly T[]): T[] {
  const queues = sellQueues(rows);
  return rows.map((row) => {
    if (row.type !== "sell") return row;
    const ticker = String(row.ticker || "").trim().toUpperCase();
    const line = queues.get(`${ticker}|${buyLotDay(row)}`)?.shift();
    if (!line || line.realisedNzd == null || line.pricePnlNzd == null || line.fxPnlNzd == null) return row;
    return {
      ...row,
      realized_price_pnl_nzd: line.pricePnlNzd,
      realized_fx_pnl_nzd: line.fxPnlNzd,
      realized_pnl_nzd: line.realisedNzd,
      realized_pnl: line.realisedNzd,
    };
  });
}

export interface FifoRecomputeRow {
  ticker: string;
  when: string;
  stored: number | null;
  fifo: number | null;
  price: number | null;
  fx: number | null;
}

export function fifoRecomputePlan(rows: readonly TaxLedgerRow[]): FifoRecomputeRow[] {
  const queues = sellQueues(rows);
  const plan: FifoRecomputeRow[] = [];
  for (const row of rows) {
    if (row.type !== "sell") continue;
    const ticker = String(row.ticker || "").trim().toUpperCase();
    const line = queues.get(`${ticker}|${buyLotDay(row)}`)?.shift();
    const stored =
      typeof row.realized_pnl_nzd === "number"
        ? roundMoney(row.realized_pnl_nzd)
        : typeof row.realized_pnl === "number"
          ? roundMoney(row.realized_pnl)
          : null;
    plan.push({
      ticker,
      when: line?.when || buyLotDay(row),
      stored,
      fifo: line?.realisedNzd ?? null,
      price: line?.pricePnlNzd ?? null,
      fx: line?.fxPnlNzd ?? null,
    });
  }
  return plan;
}

export function formatFifoRecomputeDryRun(rows: readonly TaxLedgerRow[]): string {
  const plan = fifoRecomputePlan(rows);
  const counted = plan.filter((row) => row.fifo != null);
  const combined = roundMoney(counted.reduce((sum, row) => sum + (row.fifo ?? 0), 0));
  const changes = plan.filter((row) => row.fifo != null && row.stored != null && Math.abs(row.fifo - row.stored) >= 0.005);
  const lines = [
    "FIFO recompute dry-run",
    COST_METHOD_LABEL,
    "NOT APPLIED. This script does not write. Lukas must confirm the cost method before any recompute.",
    "",
    "Sample book (not production):",
    ...plan.map((row) => {
      const stored = row.stored == null ? "blank" : formatSignedMoney(row.stored);
      const fifo = row.fifo == null ? "blank" : formatSignedMoney(row.fifo);
      return `- ${row.ticker} ${row.when} stored ${stored} FIFO ${fifo}`;
    }),
    `Combined FIFO ${formatSignedMoney(combined)}`,
    `Rows that would change: ${changes.length}`,
  ];
  return `${lines.join("\n")}\n`;
}

export interface DatetimeBackfillRow {
  ticker: string;
  shown: string;
  proposed: string | null;
  note: string;
}

export function datetimeBackfillPlan(rows: readonly LotClockRow[]): DatetimeBackfillRow[] {
  return rows.map((row) => {
    const shown = ledgerDisplayWhen(row);
    const created = String(row.createdAt || "").trim();
    if (movementHasClock(shown)) {
      return { ticker: String(row.ticker || ""), shown, proposed: null, note: "clock already shown" };
    }
    if (created && !isUnknownClock(created)) {
      return {
        ticker: String(row.ticker || ""),
        shown,
        proposed: formatLedgerDateTime(created),
        note: "would copy createdAt into DateTime_NZ",
      };
    }
    return { ticker: String(row.ticker || ""), shown, proposed: null, note: "time not stored" };
  });
}

interface LotClockRow {
  ticker?: string | null;
  trade_date?: string | null;
  trade_datetime?: string | null;
  executed_at?: string | null;
  createdAt?: string | null;
}

export function formatDatetimeBackfillDryRun(rows: readonly LotClockRow[]): string {
  const plan = datetimeBackfillPlan(rows);
  const lines = [
    "DateTime_NZ backfill dry-run",
    "NOT APPLIED. This script does not write. Lukas must approve the backfill before it runs.",
    "",
    ...plan.map((row) => {
      const next = row.proposed ? `proposed ${row.proposed}` : "no write";
      return `- ${row.ticker || "row"} shown "${row.shown}" ${next} (${row.note})`;
    }),
  ];
  return `${lines.join("\n")}\n`;
}
