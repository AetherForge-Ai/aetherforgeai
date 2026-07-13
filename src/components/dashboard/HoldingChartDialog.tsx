"use client";

/**
 * HoldingChartDialog — a focused "last 7 days" performance chart for a single
 * holding, opened by clicking a ticker in the Current Holdings table.
 *
 * Keeps things glanceable: current price, the 7-day trend line, the 7-day
 * change, and how the position is doing against the price you paid. It reuses
 * the existing /api/stock-detail endpoint (with a light `range` fetch) and
 * slices the most recent ~7 daily closes for the chart.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { formatMoney, type CurrencyCode } from "@/lib/currency";
import { cn } from "@/lib/utils";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { ArrowUp, ArrowDown, Loader2, BarChart3, CalendarDays } from "lucide-react";

export interface HoldingChartTarget {
  ticker: string; // internal ticker, e.g. FPH.NZ
  symbol: string; // clean symbol, e.g. FPH
  name: string;
  exchange: string; // display label, e.g. NZX
  currency: CurrencyCode;
  purchasePrice: number;
  currentPrice: number;
}

interface DetailPayload {
  history: number[]; // oldest → newest daily closes
  quote: { price: number };
}

/** Short day labels for the last N points (approx trading days, most recent = Now). */
function dayLabels(n: number): string[] {
  const labels: string[] = [];
  for (let i = n - 1; i >= 0; i--) labels.push(i === 0 ? "Now" : `-${i}d`);
  return labels;
}

export function HoldingChartDialog({
  open,
  onOpenChange,
  target,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  target: HoldingChartTarget | null;
}) {
  const [history, setHistory] = useState<number[] | null>(null);
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (t: HoldingChartTarget) => {
    setLoading(true);
    setError(null);
    setHistory(null);
    console.log(`[holding-chart] Loading 7-day series for ${t.ticker}`);
    const res = await api.get<DetailPayload>(
      `/api/stock-detail?symbol=${encodeURIComponent(t.ticker)}&range=1mo&t=${Date.now()}`
    );
    if (res.ok && res.data && Array.isArray(res.data.history) && res.data.history.length > 0) {
      setHistory(res.data.history);
      setLivePrice(res.data.quote?.price ?? null);
    } else {
      console.error("[holding-chart] Load failed:", res.error);
      setError("Live 7-day data for this ticker is unavailable right now.");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open && target) load(target);
    if (!open) {
      setHistory(null);
      setError(null);
      setLivePrice(null);
    }
  }, [open, target, load]);

  const currency = target?.currency ?? "USD";

  // Slice the most recent 7 daily closes and append the live price as "Now".
  const series = useMemo(() => {
    if (!history || history.length === 0) return [];
    const last7 = history.slice(-7);
    if (livePrice && livePrice > 0) {
      last7[last7.length - 1] = livePrice;
    }
    const labels = dayLabels(last7.length);
    return last7.map((close, i) => ({ label: labels[i], close }));
  }, [history, livePrice]);

  const sevenDayChange = useMemo(() => {
    if (series.length < 2) return null;
    const first = series[0].close;
    const last = series[series.length - 1].close;
    if (!first) return null;
    const abs = last - first;
    const pct = (abs / first) * 100;
    return { abs, pct };
  }, [series]);

  const up = (sevenDayChange?.pct ?? 0) >= 0;
  const stroke = up ? "var(--chart-1)" : "var(--chart-5)";

  const current = livePrice ?? target?.currentPrice ?? 0;
  const paid = target?.purchasePrice ?? 0;
  const posPct = paid > 0 ? ((current - paid) / paid) * 100 : 0;
  const posUp = posPct >= 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-xl gap-0 p-0">
        <DialogHeader className="border-b border-border/60 px-5 py-4 sm:px-6">
          <DialogTitle className="flex flex-wrap items-center gap-2 font-display text-xl">
            <span className="text-primary">{target?.symbol}</span>
            {target?.exchange && (
              <span className="rounded-md bg-primary/12 px-2 py-0.5 text-[0.62rem] font-bold uppercase tracking-wide text-primary">
                {target.exchange}
              </span>
            )}
            <span className="inline-flex items-center gap-1 rounded-md border border-border/60 px-2 py-0.5 text-[0.62rem] font-semibold text-muted-foreground">
              <CalendarDays className="size-3" /> Last 7 days
            </span>
          </DialogTitle>
          <DialogDescription className="truncate">{target?.name}</DialogDescription>
        </DialogHeader>

        <div className="px-5 py-4 sm:px-6">
          {loading ? (
            <div className="flex h-60 items-center justify-center text-muted-foreground">
              <Loader2 className="mr-2 size-5 animate-spin" /> Loading last 7 days…
            </div>
          ) : error ? (
            <div className="flex h-60 flex-col items-center justify-center gap-3 text-center text-sm text-muted-foreground">
              {error}
              {target && (
                <Button variant="outline" size="sm" onClick={() => load(target)}>
                  Try again
                </Button>
              )}
            </div>
          ) : (
            <>
              {/* Current price + 7-day change */}
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-[0.68rem] uppercase tracking-wide text-muted-foreground">
                    Current price
                  </p>
                  <p className="tnum font-display text-3xl font-bold">{formatMoney(current, currency)}</p>
                </div>
                {sevenDayChange && (
                  <div
                    className={cn(
                      "rounded-xl px-3 py-2 text-right ring-1",
                      up
                        ? "bg-emerald-500/10 text-emerald-400 ring-emerald-500/25"
                        : "bg-rose-500/10 text-rose-400 ring-rose-500/25"
                    )}
                  >
                    <p className="tnum flex items-center gap-1 text-lg font-semibold">
                      {up ? <ArrowUp className="size-4" /> : <ArrowDown className="size-4" />}
                      {Math.abs(sevenDayChange.pct).toFixed(2)}%
                    </p>
                    <p className="text-[11px] text-muted-foreground">last 7 days</p>
                  </div>
                )}
              </div>

              {/* 7-day chart */}
              <div className="mt-4 h-56 w-full">
                {series.length > 1 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={series} margin={{ top: 8, right: 6, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="holdingFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={stroke} stopOpacity={0.35} />
                          <stop offset="100%" stopColor={stroke} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 6%)" vertical={false} />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        domain={["dataMin", "dataMax"]}
                        width={56}
                        tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                        tickFormatter={(v) => Number(v).toFixed(Number(v) < 5 ? 2 : 0)}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "var(--popover)",
                          border: "1px solid var(--border)",
                          borderRadius: 12,
                          fontSize: 12,
                        }}
                        labelFormatter={(l) => `Day ${l}`}
                        formatter={(v: any) => [formatMoney(Number(v), currency), "Close"]}
                      />
                      <Area
                        type="monotone"
                        dataKey="close"
                        stroke={stroke}
                        strokeWidth={2.5}
                        fill="url(#holdingFill)"
                        dot={{ r: 2.5, fill: stroke }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-border/60 text-xs text-muted-foreground">
                    <BarChart3 className="mr-2 size-4" /> 7-day price history unavailable
                  </div>
                )}
              </div>

              {/* Your position vs price paid */}
              <div className="mt-4 grid grid-cols-3 gap-2">
                <div className="rounded-xl border border-border/60 bg-background/40 px-3 py-2.5">
                  <p className="text-[0.6rem] uppercase tracking-wide text-muted-foreground">Price paid</p>
                  <p className="tnum mt-0.5 text-sm font-semibold">{formatMoney(paid, currency)}</p>
                </div>
                <div className="rounded-xl border border-border/60 bg-background/40 px-3 py-2.5">
                  <p className="text-[0.6rem] uppercase tracking-wide text-muted-foreground">7-day move</p>
                  <p
                    className={cn(
                      "tnum mt-0.5 text-sm font-semibold",
                      sevenDayChange ? (up ? "text-emerald-400" : "text-rose-400") : ""
                    )}
                  >
                    {sevenDayChange
                      ? `${sevenDayChange.abs >= 0 ? "+" : "−"}${formatMoney(
                          Math.abs(sevenDayChange.abs),
                          currency
                        )}`
                      : "—"}
                  </p>
                </div>
                <div className="rounded-xl border border-border/60 bg-background/40 px-3 py-2.5">
                  <p className="text-[0.6rem] uppercase tracking-wide text-muted-foreground">Your P/L</p>
                  <p
                    className={cn(
                      "tnum mt-0.5 text-sm font-semibold",
                      posUp ? "text-emerald-400" : "text-rose-400"
                    )}
                  >
                    {posUp ? "+" : "−"}
                    {Math.abs(posPct).toFixed(2)}%
                  </p>
                </div>
              </div>

              <p className="mt-3 text-[0.62rem] leading-relaxed text-muted-foreground">
                Most recent daily closes, ending with the latest live price. Prices from Yahoo Finance;
                NZX quotes may be delayed ~20 minutes. Educational only — not financial advice.
              </p>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
