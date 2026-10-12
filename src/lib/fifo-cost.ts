/**
 * FIFO figures for the ledger, holdings, CSV and the recompute dry-run.
 * Nothing here writes a database row.
 */

import { formatSignedMoney, roundMoney } from "@/lib/currency";
import { formatLedgerDateTime, isUnknownClock } from "@/lib/executed-at";
import { buyLotDay, COST_METHOD_LABEL, ledgerDisplayWhen, movementHasClock } from "@/lib/lot-day";
import { nzTaxYearEnding } from "@/lib/nz-tax-year";
import { fifoRemainingUnitCosts, realisedByTaxYear, type RealisedLine } from "@/lib/tax-realised";
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
  const years = new Set<number>([calendarYear, calendarYear + 1]);
  for (const row of rows) {
    const ending = nzTaxYearEnding(buyLotDay(row) || row.executed_at || row.createdAt);
    if (ending != null) years.add(ending);
  }
  const lines: RealisedLine[] = [];
  for (const year of years) {
    const report = realisedByTaxYear(rows, year);
    lines.push(...report.other, ...report.crypto);
  }
  const counted = lines.filter((line) => line.realisedNzd != null);
  const ytdLines = counted.filter((line) => line.when.startsWith(String(calendarYear)));
  const sum = (list: RealisedLine[]) => roundMoney(list.reduce((total, line) => total + (line.realisedNzd ?? 0), 0));
  return { ytd: sum(ytdLines), ytdCount: ytdLines.length, all: sum(counted), allCount: counted.length };
}

function sellQueues(rows: readonly TaxLedgerRow[]): Map<string, RealisedLine[]> {
  const years = new Set<number>();
  for (const row of rows) {
    const ending = nzTaxYearEnding(buyLotDay(row) || row.executed_at || row.createdAt);
    if (ending != null) years.add(ending);
  }
  const queues = new Map<string, RealisedLine[]>();
  for (const year of [...years].sort((a, b) => a - b)) {
    const report = realisedByTaxYear(rows, year);
    for (const line of [...report.other, ...report.crypto]) {
      const key = `${line.ticker}|${line.when}`;
      const list = queues.get(key) || [];
      list.push(line);
      queues.set(key, list);
    }
  }
  return queues;
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
