/**
 * Goal b12 G-02: the app's performance panel. XIRR, TWR and periods come from
 * performance-math.ts (the same functions the 20-flow golden test asserts).
 * Value before each deposit is only known for the first deposit (zero) unless
 * a stored value history is supplied, so TWR shows "—" with the reason rather
 * than an estimate. Benchmarks show "—" until index history is stored.
 */
import { externalFlowsFromLedger, performanceReport, type BookPoint, type LedgerCashRow, type PerformanceReport } from "@/lib/performance-math";

export const BENCHMARKS = [
  { name: "NZX 50", reason: "NZX 50 history in NZ$ is not stored yet, so the comparison is not shown." },
  { name: "S&P 500 (in NZ$)", reason: "S&P 500 history converted to NZ$ is not stored yet, so the comparison is not shown." },
] as const;

/**
 * Goal b13 G-02: the dashboard snapshot ledger uses { cashNzd, when } while the
 * maths reads { cash_nzd, trade_date }. b12 passed snapshot lines straight in,
 * so a NZ$10,000 deposit was never seen. Both shapes are accepted here, and an
 * opening cash balance (opening_balance with no ticker) counts as a deposit,
 * the same as the dashboard's Net contributions.
 */
export function toLedgerCashRows(rows: readonly Record<string, unknown>[]): LedgerCashRow[] {
  return rows.map((row) => {
    let type = String(row.type || "").toLowerCase();
    const ticker = String(row.ticker || "").trim();
    if (type === "opening_balance" && !ticker) type = "deposit";
    const when = (row.trade_date ?? row.executed_at ?? row.when ?? "") as string;
    const cash = row.cash_nzd ?? row.cashNzd ?? row.total;
    return { ...(row as object), type, trade_date: String(when), cash_nzd: cash as number } as LedgerCashRow;
  });
}

export interface BookPerformance {
  report: PerformanceReport | null;
  message: string | null;
  flows: number;
}

export function bookPerformance(input: {
  ledger: readonly LedgerCashRow[];
  netWorthNzd: number | null;
  asOf: string;
  source: string;
  valueHistory?: ReadonlyMap<string, number>;
}): BookPerformance {
  const flows = externalFlowsFromLedger(toLedgerCashRows(input.ledger as unknown as Record<string, unknown>[]));
  if (!flows.length) {
    return { report: null, message: "Add a deposit to measure performance. Returns are measured from money you put in.", flows: 0 };
  }
  if (input.netWorthNzd == null) {
    return { report: null, message: "Net worth is not available yet, so returns are not shown.", flows: flows.length };
  }
  const points: BookPoint[] = flows.map((f, i) => {
    const stored = input.valueHistory?.get(f.date);
    if (i === 0) return { date: f.date, valueBeforeNzd: stored ?? 0, flowNzd: f.amountNzd };
    return stored != null
      ? { date: f.date, valueBeforeNzd: stored, flowNzd: f.amountNzd }
      : { date: f.date, valueBeforeNzd: 0, flowNzd: f.amountNzd, valueKnown: false };
  });
  const report = performanceReport({ points, endingNzd: input.netWorthNzd, asOf: input.asOf, source: input.source });
  const message = flows.length === 1 ? "One deposit so far. XIRR and TWR are the same measure until a second cash flow." : null;
  return { report, message, flows: flows.length };
}

export function pct(value: number | null): string {
  return value == null || !Number.isFinite(value) ? "—" : `${(value * 100).toFixed(2)}%`;
}
