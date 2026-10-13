"use client";

import { useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";

import { FigureReadout } from "@/components/dashboard/ShowTheMaths";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatNzd } from "@/lib/currency";
import {
  BENCHMARKS,
  CHART_BLANK_REASON,
  PERIODS,
  returnSplitWeights,
  type BenchmarkId,
  type KpiView,
  type PercentMode,
  type PeriodId,
} from "@/lib/dashboard-kpi";
import { MISSING_MARK, type SnapshotCashLine } from "@/lib/portfolio-snapshot";
import { cn } from "@/lib/utils";

const SEGMENT_BAR: Record<KpiView["segments"][number]["id"], string> = {
  capital: "bg-primary",
  income: "bg-emerald-600",
  currency: "bg-amber-400",
  fees: "bg-rose-600",
};

export function KpiHeader({
  view,
  loading,
  asOfLabel,
  period,
  onPeriod,
  customFrom,
  customTo,
  onCustom,
  percentMode,
  annualisedEnabled,
  annualisedReason,
  onPercentMode,
  benchmarkId,
  onBenchmark,
  cashLines,
  cashWarning,
}: {
  view: KpiView | null;
  loading: boolean;
  asOfLabel: string | null;
  period: PeriodId;
  onPeriod: (period: PeriodId) => void;
  customFrom: string;
  customTo: string;
  onCustom: (from: string, to: string) => void;
  percentMode: PercentMode;
  annualisedEnabled: boolean;
  annualisedReason: string;
  onPercentMode: (mode: PercentMode) => void;
  benchmarkId: BenchmarkId;
  onBenchmark: (id: BenchmarkId) => void;
  cashLines: SnapshotCashLine[];
  cashWarning: string | null;
}) {
  const [chartOpen, setChartOpen] = useState(true);
  const weights = view ? returnSplitWeights(view.segments) : null;
  const todayMissing = !view || (view.today.display === MISSING_MARK && view.todayPct.display === MISSING_MARK);
  const benchmarkMissing = !view || view.benchmark.display === MISSING_MARK;
  const historyReady = !!view && view.chartReason !== CHART_BLANK_REASON;
  return (
    <section className="mt-6" aria-busy={loading || undefined} data-section="kpi-header">
      <div className="grid min-w-0 grid-cols-2 gap-2 md:gap-3 xl:grid-cols-3">
        <KpiCard label="Net worth" loading={loading}>
          {view ? <FigureReadout figure={view.netWorth} label="Net worth" showReason className="items-start" /> : null}
        </KpiCard>
        {todayMissing ? null : (
        <KpiCard label="Today" loading={loading}>
          {view ? (
            <span className="flex flex-col items-start gap-1">
              <FigureReadout figure={view.today} label="Today" signed showReason className="items-start" />
              <FigureReadout figure={view.todayPct} label="Today percent" signed className="items-start" />
            </span>
          ) : null}
        </KpiCard>
        )}
        <KpiCard label="Total return" loading={loading}>
          {view ? (
            <span className="flex w-full flex-col items-start gap-2">
              <span className="flex flex-wrap items-baseline gap-2">
                <FigureReadout figure={view.totalReturn} label="Total return" signed showReason className="items-start" />
                <FigureReadout figure={view.percent} label={view.percentLabel} showReason className="items-start" />
              </span>
              <span className="hidden w-full md:block">
                <SplitBar view={view} weights={weights} />
              </span>
            </span>
          ) : null}
        </KpiCard>
        <KpiCard label="Cash" loading={loading}>
          {view ? (
            <span className="flex flex-col items-start gap-1">
              <FigureReadout figure={view.cash} label="Cash" showReason className="items-start" />
              <CashByCurrency lines={cashLines} warning={cashWarning} />
            </span>
          ) : null}
        </KpiCard>
        <KpiCard label="Net contributions" loading={loading}>
          {view ? <FigureReadout figure={view.contributions} label="Net contributions" signed showReason className="items-start" /> : null}
        </KpiCard>
        {benchmarkMissing ? null : (
        <KpiCard label={`vs ${view?.benchmarkName || "NZX 50"}`} loading={loading}>
          {view ? <FigureReadout figure={view.benchmark} label={`Versus ${view.benchmarkName}`} showReason className="items-start" /> : null}
        </KpiCard>
        )}
      </div>
      {view && (todayMissing || benchmarkMissing) ? (
        <p className="mt-2 text-xs text-muted-foreground">Day change and the NZX 50 comparison appear after a previous close is stored.</p>
      ) : null}

      {historyReady ? (
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="inline-flex flex-wrap gap-1" role="group" aria-label="Period">
          {PERIODS.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={period === item.id}
              disabled={loading}
              onClick={() => onPeriod(item.id)}
              className={cn(
                "rounded-md border px-2.5 py-1 text-xs font-semibold focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none",
                period === item.id ? "border-primary bg-primary text-primary-foreground" : "border-border/70 text-muted-foreground hover:text-foreground"
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
        {period === "custom" ? (
          <fieldset className="flex flex-wrap items-center gap-2 text-xs" disabled={loading}>
            <legend className="sr-only">Custom period</legend>
            <label className="flex items-center gap-1 text-muted-foreground">
              Start
              <input
                type="date"
                value={customFrom}
                onChange={(event) => onCustom(event.target.value, customTo)}
                className="rounded-md border border-border/70 bg-background px-2 py-1 text-foreground"
              />
            </label>
            <label className="flex items-center gap-1 text-muted-foreground">
              End
              <input
                type="date"
                value={customTo}
                onChange={(event) => onCustom(customFrom, event.target.value)}
                className="rounded-md border border-border/70 bg-background px-2 py-1 text-foreground"
              />
            </label>
          </fieldset>
        ) : null}
        <div className="inline-flex rounded-lg border border-border/60 p-0.5 text-xs font-semibold" role="group" aria-label="Return percent">
          <button
            type="button"
            aria-pressed={percentMode === "simple"}
            disabled={loading}
            onClick={() => onPercentMode("simple")}
            className={cn("rounded-md px-2.5 py-1", percentMode === "simple" ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
          >
            Simple %
          </button>
          <button
            type="button"
            aria-pressed={percentMode === "annualised"}
            disabled={loading || !annualisedEnabled}
            title={annualisedReason}
            onClick={() => onPercentMode("annualised")}
            className={cn(
              "rounded-md px-2.5 py-1",
              percentMode === "annualised" ? "bg-primary text-primary-foreground" : "text-muted-foreground",
              !annualisedEnabled && "cursor-not-allowed opacity-50"
            )}
          >
            % p.a.
          </button>
        </div>
        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          Benchmark
          <select
            aria-label="Benchmark"
            value={benchmarkId}
            disabled={loading}
            onChange={(event) => onBenchmark(event.target.value as BenchmarkId)}
            className="rounded-md border border-border/70 bg-background px-2 py-1 text-foreground"
          >
            {BENCHMARKS.map((benchmark) => (
              <option key={benchmark.id} value={benchmark.id}>
                {benchmark.label}
              </option>
            ))}
          </select>
        </label>
        {asOfLabel ? <span className="text-xs text-muted-foreground">As of {asOfLabel}</span> : null}
        {view?.filteredNote ? <span className="text-xs font-medium text-foreground">{view.filteredNote}</span> : null}
        {view?.periodNote ? <span className="text-xs text-muted-foreground">{view.periodNote}</span> : null}
      </div>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">Period and benchmark controls appear when a value history is stored.</p>
      )}

      <Collapsible open={chartOpen} onOpenChange={setChartOpen} className="mt-3" data-chart-open={chartOpen ? "true" : "false"}>
        <CollapsibleTrigger className="inline-flex items-center gap-1 text-sm font-semibold text-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none">
          <ChevronRight className={cn("size-4 transition-transform", chartOpen && "rotate-90")} aria-hidden />
          Chart
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2 rounded-2xl border border-border/70 bg-card/50 p-4 text-sm text-muted-foreground">
          <p>
            {MISSING_MARK} {view?.chartReason || CHART_BLANK_REASON}
          </p>
          <p className="mt-1 text-xs">Value, net contributions, and the benchmark need a stored history.</p>
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
}

function KpiCard({
  label,
  loading,
  children,
  className,
}: {
  label: string;
  loading: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 rounded-2xl border border-border/70 bg-card/50 p-3 md:min-h-[8.75rem] md:p-4", className)}>
      <p className="text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground md:text-xs">{label}</p>
      {loading ? (
        <div className="mt-2 h-6 w-20 animate-pulse rounded-md bg-muted/50 motion-reduce:animate-none md:mt-3 md:h-7 md:w-24" />
      ) : (
        <div className="mt-1 text-base font-bold text-foreground md:mt-2 md:text-lg">{children}</div>
      )}
    </div>
  );
}

function SplitBar({ view, weights }: { view: KpiView; weights: number[] | null }) {
  return (
    <div className="w-full">
      {weights ? (
        <div className="flex h-2 overflow-hidden rounded-full bg-muted/40" aria-hidden>
          {view.segments.map((segment, index) => (
            <div key={segment.id} className={SEGMENT_BAR[segment.id]} style={{ width: `${weights[index]}%` }} />
          ))}
        </div>
      ) : null}
      <ul className="mt-2 grid grid-cols-2 gap-1 text-[0.65rem] font-normal text-muted-foreground">
        {view.segments.map((segment) => (
          <li key={segment.id} className="flex items-center justify-between gap-1">
            <span>{segment.label}</span>
            <FigureReadout figure={segment.figure} label={segment.label} signed showReason={segment.figure.display === MISSING_MARK} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function CashByCurrency({ lines, warning }: { lines: SnapshotCashLine[]; warning: string | null }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs">
          By currency
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80">
        <p className="text-sm font-medium">Cash</p>
        {warning ? <p className="mt-1 text-xs text-muted-foreground">{warning}</p> : null}
        <ul className="mt-2 space-y-2">
          {lines.map((line) => (
            <li key={line.currency} className="text-xs">
              <span className="font-semibold">{line.currency}</span>
              <span className="mt-0.5 block text-muted-foreground">
                Balance {formatLocal(line.amountLocal)} · Rate {line.fxDisplay}
              </span>
              <span className="tnum block">
                {line.valueNzd == null ? MISSING_MARK : formatNzd(line.valueNzd)}
                {line.valueNzd == null ? <span className="ml-1">Foreign cash has no exchange rate, so its NZ$ value is blank.</span> : null}
              </span>
              {line.negative ? <span className="block text-muted-foreground">Below zero. Shown as it is, not raised to zero.</span> : null}
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

function formatLocal(value: number): string {
  if (!Number.isFinite(value)) return MISSING_MARK;
  return new Intl.NumberFormat("en-NZ", { maximumFractionDigits: 2 }).format(value);
}
