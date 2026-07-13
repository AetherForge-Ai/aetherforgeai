"use client";

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
import { formatMarketPrice, type Exchange } from "@/lib/market-intel";
import { BuyDialog, type BuyTarget } from "@/components/dashboard/BuyDialog";
import { TickerAnalysisPane } from "@/components/dashboard/TickerAnalysisPane";
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
import {
  ArrowUp,
  ArrowDown,
  Loader2,
  ShoppingCart,
  Clock,
  Activity,
  BarChart3,
} from "lucide-react";

export interface DetailTarget {
  symbol: string; // clean display symbol (e.g. FPH)
  ticker: string; // internal ticker (e.g. FPH.NZ)
  name?: string;
  exchange?: Exchange;
  currency?: "NZD" | "AUD" | "USD";
}

interface DetailQuote {
  price: number;
  changePct: number;
  changeAbs: number;
  prevClose: number;
  open: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  volume: number | null;
  marketCap: number | null;
}

interface DetailPayload {
  symbol: string;
  ticker: string;
  name: string;
  currency: "NZD" | "AUD" | "USD";
  exchangeLabel: string | null;
  quote: DetailQuote;
  history: number[];
  asOf: string;
}

const EX_LABEL: Record<Exchange, string> = {
  NZX: "NZX",
  ASX: "ASX",
  DOW: "Dow Jones",
  NASDAQ: "NASDAQ",
};

const volFmt = new Intl.NumberFormat("en-NZ", { notation: "compact", maximumFractionDigits: 1 });

function fmtCap(v: number | null, currency: string): string {
  if (!v || v <= 0) return "—";
  const sym = currency === "USD" ? "$" : currency === "AUD" ? "A$" : "NZ$";
  const abs = Math.abs(v);
  const unit = abs >= 1e12 ? ["T", 1e12] : abs >= 1e9 ? ["B", 1e9] : abs >= 1e6 ? ["M", 1e6] : ["", 1];
  return `${sym}${(v / (unit[1] as number)).toFixed(abs >= 1e9 ? 2 : 1)}${unit[0]}`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/40 px-3 py-2.5">
      <p className="text-[0.6rem] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="tnum mt-0.5 text-sm font-semibold">{value}</p>
    </div>
  );
}

export function StockDetailDialog({
  open,
  onOpenChange,
  target,
  canBuy = true,
  onBought,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  target: DetailTarget | null;
  canBuy?: boolean;
  onBought?: () => void;
}) {
  const [data, setData] = useState<DetailPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [buyOpen, setBuyOpen] = useState(false);
  const [buyTarget, setBuyTarget] = useState<BuyTarget | null>(null);

  const load = useCallback(async (t: DetailTarget) => {
    setLoading(true);
    setError(null);
    console.log(`[stock-detail] Loading ${t.ticker}`);
    const res = await api.get<DetailPayload>(`/api/stock-detail?symbol=${encodeURIComponent(t.ticker)}&t=${Date.now()}`);
    if (res.ok && res.data) {
      setData(res.data);
    } else {
      console.error("[stock-detail] Load failed:", res.error);
      setError("Live data for this ticker is unavailable right now.");
      setData(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open && target) load(target);
    if (!open) {
      setData(null);
      setError(null);
    }
  }, [open, target, load]);

  const currency = data?.currency ?? target?.currency ?? "USD";
  const name = data?.name ?? target?.name ?? target?.symbol ?? "";
  const symbol = target?.symbol ?? data?.symbol ?? "";
  const exLabel = target?.exchange ? EX_LABEL[target.exchange] : data?.exchangeLabel ?? "";

  const chartData = useMemo(() => {
    const h = data?.history ?? [];
    return h.map((close, i) => ({ i, close }));
  }, [data]);

  const up = (data?.quote.changePct ?? 0) >= 0;
  const stroke = up ? "var(--chart-1)" : "var(--chart-5)";

  function openBuy() {
    if (!target) return;
    setBuyTarget({
      ticker: target.ticker,
      name,
      assetType: "stock",
      price: data?.quote.price,
    });
    setBuyOpen(true);
  }

  const q = data?.quote;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[92vh] w-[96vw] max-w-5xl flex-col gap-0 overflow-hidden p-0">
          {/* Header */}
          <DialogHeader className="border-b border-border/60 px-5 py-4 sm:px-6">
            <DialogTitle className="flex flex-wrap items-center gap-2 font-display text-xl">
              <span className="text-primary">{symbol}</span>
              {exLabel && (
                <span className="rounded-md bg-primary/12 px-2 py-0.5 text-[0.62rem] font-bold uppercase tracking-wide text-primary">
                  {exLabel}
                </span>
              )}
            </DialogTitle>
            <DialogDescription className="truncate">{name}</DialogDescription>
          </DialogHeader>

          {/* Body — scrolls; two columns on desktop (data + chart | AI pane) */}
          <div className="grid min-h-0 flex-1 gap-0 overflow-hidden lg:grid-cols-[1.35fr_1fr]">
            {/* Left: price, chart, stats */}
            <div className="min-h-0 overflow-y-auto px-5 py-4 sm:px-6">
              {loading ? (
                <div className="flex h-64 items-center justify-center text-muted-foreground">
                  <Loader2 className="mr-2 size-5 animate-spin" /> Loading live data…
                </div>
              ) : error ? (
                <div className="flex h-64 flex-col items-center justify-center gap-3 text-center text-sm text-muted-foreground">
                  {error}
                  {target && (
                    <Button variant="outline" size="sm" onClick={() => load(target)}>
                      Try again
                    </Button>
                  )}
                </div>
              ) : q ? (
                <>
                  {/* Price + change */}
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <p className="tnum font-display text-3xl font-bold">
                        {formatMarketPrice(q.price, currency)}
                      </p>
                      <p
                        className={cn(
                          "tnum mt-1 flex items-center gap-1 text-sm font-semibold",
                          up ? "text-emerald-400" : "text-rose-400"
                        )}
                      >
                        {up ? <ArrowUp className="size-4" /> : <ArrowDown className="size-4" />}
                        {q.changeAbs >= 0 ? "+" : "−"}
                        {Math.abs(q.changeAbs).toFixed(q.price < 5 ? 4 : 2)} ({Math.abs(q.changePct).toFixed(2)}%)
                        <span className="text-muted-foreground">today</span>
                      </p>
                    </div>
                    {canBuy && (
                      <Button onClick={openBuy} className="gap-1.5 font-semibold shadow-glow">
                        <ShoppingCart className="size-4" /> Buy {symbol}
                      </Button>
                    )}
                  </div>

                  {/* Chart */}
                  <div className="mt-4 h-56 w-full">
                    {chartData.length > 1 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData} margin={{ top: 8, right: 6, left: 0, bottom: 0 }}>
                          <defs>
                            <linearGradient id="detailFill" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor={stroke} stopOpacity={0.35} />
                              <stop offset="100%" stopColor={stroke} stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 6%)" vertical={false} />
                          <XAxis dataKey="i" hide />
                          <YAxis
                            domain={["dataMin", "dataMax"]}
                            width={52}
                            tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                            tickFormatter={(v) => Number(v).toFixed(v < 5 ? 2 : 0)}
                          />
                          <Tooltip
                            contentStyle={{
                              background: "var(--popover)",
                              border: "1px solid var(--border)",
                              borderRadius: 12,
                              fontSize: 12,
                            }}
                            labelFormatter={() => ""}
                            formatter={(v: any) => [formatMarketPrice(Number(v), currency), "Close"]}
                          />
                          <Area
                            type="monotone"
                            dataKey="close"
                            stroke={stroke}
                            strokeWidth={2}
                            fill="url(#detailFill)"
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-border/60 text-xs text-muted-foreground">
                        <BarChart3 className="mr-2 size-4" /> Price history unavailable
                      </div>
                    )}
                  </div>
                  <p className="mt-1 flex items-center gap-1 text-[0.62rem] text-muted-foreground">
                    <Activity className="size-3" /> ~6-month daily closes
                    {target?.exchange === "NZX" && (
                      <span className="ml-2 flex items-center gap-1">
                        <Clock className="size-3" /> NZX may be delayed ~20 min
                      </span>
                    )}
                  </p>

                  {/* Key statistics */}
                  <div className="mt-4">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Key statistics
                    </p>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      <Stat label="Open" value={q.open ? formatMarketPrice(q.open, currency) : "—"} />
                      <Stat label="Prev close" value={formatMarketPrice(q.prevClose, currency)} />
                      <Stat label="Day high" value={q.dayHigh ? formatMarketPrice(q.dayHigh, currency) : "—"} />
                      <Stat label="Day low" value={q.dayLow ? formatMarketPrice(q.dayLow, currency) : "—"} />
                      <Stat
                        label="52-wk high"
                        value={q.fiftyTwoWeekHigh ? formatMarketPrice(q.fiftyTwoWeekHigh, currency) : "—"}
                      />
                      <Stat
                        label="52-wk low"
                        value={q.fiftyTwoWeekLow ? formatMarketPrice(q.fiftyTwoWeekLow, currency) : "—"}
                      />
                      <Stat label="Volume" value={q.volume ? volFmt.format(q.volume) : "—"} />
                      <Stat label="Market cap" value={fmtCap(q.marketCap, currency)} />
                      <Stat label="Currency" value={currency} />
                    </div>
                  </div>
                </>
              ) : null}
            </div>

            {/* Right: Stox AI analysis pane, pre-filled with the ticker */}
            <div className="min-h-0 border-t border-border/60 p-4 lg:border-l lg:border-t-0">
              <div className="h-[380px] lg:h-full">
                {open && target && (
                  <TickerAnalysisPane symbol={symbol} name={name} botName="Stox" />
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {canBuy && (
        <BuyDialog
          open={buyOpen}
          onOpenChange={setBuyOpen}
          target={buyTarget}
          onDone={() => {
            setBuyOpen(false);
            onBought?.();
          }}
        />
      )}
    </>
  );
}
