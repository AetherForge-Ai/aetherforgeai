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
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { TickerAnalysisPane } from "@/components/dashboard/TickerAnalysisPane";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip as RTooltip,
  CartesianGrid,
} from "recharts";
import {
  ArrowUp,
  ArrowDown,
  Loader2,
  Sparkles,
  ExternalLink,
  Globe,
  Twitter,
  Github,
  BarChart3,
} from "lucide-react";
import {
  fmtPrice,
  fmtCompactUsd,
  fmtCompactNum,
  fmtPct,
  pctColor,
  fmtShortDate,
  GENERIC_COIN_ICON,
  CHART_RANGES,
  RANGE_TO_DAYS,
  type ChartRange,
  type CoinDetail,
  type CoinChart,
} from "@/lib/crypto-market";

/** Slice a chart series to the visible window for the sub-day ranges. */
function sliceRange(chart: CoinChart, range: ChartRange): { t: number; price: number }[] {
  const prices = chart.prices;
  if (range === "1H") {
    const cutoff = (prices.at(-1)?.t ?? 0) - 60 * 60 * 1000;
    const win = prices.filter((p) => p.t >= cutoff);
    return win.length > 1 ? win : prices.slice(-12);
  }
  return prices;
}

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/40 px-3 py-2.5">
      <p className="text-[0.6rem] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="tnum mt-0.5 text-sm font-semibold">{value}</p>
      {sub && <p className="text-[0.62rem] text-muted-foreground">{sub}</p>}
    </div>
  );
}

export function CoinDetailModal({
  coinId,
  open,
  onOpenChange,
}: {
  coinId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [detail, setDetail] = useState<CoinDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [range, setRange] = useState<ChartRange>("7D");
  const [chart, setChart] = useState<CoinChart | null>(null);
  const [chartLoading, setChartLoading] = useState(false);
  const [chartCache, setChartCache] = useState<Record<string, CoinChart>>({});

  const [showAnalysis, setShowAnalysis] = useState(false);

  // Load coin metadata whenever the modal opens for a coin.
  const loadDetail = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    console.log(`[coin-detail] loading ${id}`);
    const res = await api.get<CoinDetail>(`/api/crypto/coin/${encodeURIComponent(id)}`);
    if (res.ok && res.data) setDetail(res.data);
    else {
      setError("Live data for this coin is unavailable right now.");
      setDetail(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open && coinId) {
      setDetail(null);
      setChart(null);
      setChartCache({});
      setRange("7D");
      setShowAnalysis(false);
      loadDetail(coinId);
    }
  }, [open, coinId, loadDetail]);

  // Load (and cache per range) the chart series.
  useEffect(() => {
    if (!open || !coinId) return;
    const days = RANGE_TO_DAYS[range];
    const key = `${coinId}:${days}`;
    if (chartCache[key]) {
      setChart(chartCache[key]);
      return;
    }
    let cancelled = false;
    (async () => {
      setChartLoading(true);
      const res = await api.get<CoinChart>(`/api/crypto/chart/${encodeURIComponent(coinId)}?days=${days}`);
      if (cancelled) return;
      if (res.ok && res.data) {
        setChart(res.data);
        setChartCache((c) => ({ ...c, [key]: res.data as CoinChart }));
      }
      setChartLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, coinId, range, chartCache]);

  const chartData = useMemo(() => {
    if (!chart) return [];
    return sliceRange(chart, range).map((p) => ({ t: p.t, price: p.price }));
  }, [chart, range]);

  const change24h = detail?.change24h ?? null;
  const up = (change24h ?? 0) >= 0;
  const stroke = chartData.length > 1 && chartData.at(-1)!.price >= chartData[0].price ? "#34d399" : "#fb7185";

  const supplyPct =
    detail?.circulatingSupply && detail?.maxSupply
      ? (detail.circulatingSupply / detail.maxSupply) * 100
      : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] w-[96vw] max-w-4xl flex-col gap-0 overflow-hidden p-0">
        {/* Header */}
        <DialogHeader className="border-b border-border/60 px-5 py-4 sm:px-6">
          {loading || !detail ? (
            <div className="flex items-center gap-3">
              <Skeleton className="size-9 rounded-full" />
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={detail.image}
                  alt={detail.name}
                  className="size-9 rounded-full"
                  onError={(e) => {
                    const t = e.currentTarget;
                    if (t.dataset.fb) return;
                    t.dataset.fb = "1";
                    t.src = GENERIC_COIN_ICON;
                  }}
                />
                <div>
                  <DialogTitle className="flex items-center gap-2 font-display text-xl">
                    {detail.name}
                    <span className="text-sm font-semibold text-muted-foreground">{detail.symbol}</span>
                    {detail.rank && (
                      <span className="rounded-md bg-primary/12 px-2 py-0.5 text-[0.62rem] font-bold uppercase tracking-wide text-primary">
                        Rank #{detail.rank}
                      </span>
                    )}
                  </DialogTitle>
                  <DialogDescription className="sr-only">
                    Live market data and price chart for {detail.name}
                  </DialogDescription>
                </div>
              </div>
              <div className="text-right">
                <p className="tnum font-display text-2xl font-bold">{fmtPrice(detail.price)}</p>
                <p
                  className={cn(
                    "tnum mt-0.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
                    up ? "bg-emerald-500/12 text-emerald-600" : "bg-rose-500/12 text-rose-600"
                  )}
                >
                  {up ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />}
                  {fmtPct(change24h)} <span className="font-normal opacity-70">24h</span>
                </p>
              </div>
            </div>
          )}
        </DialogHeader>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">
          {error ? (
            <div className="flex h-56 flex-col items-center justify-center gap-3 text-center text-sm text-muted-foreground">
              {error}
              {coinId && (
                <Button variant="outline" size="sm" onClick={() => loadDetail(coinId)}>
                  Try again
                </Button>
              )}
            </div>
          ) : (
            <>
              {/* Range selector */}
              <div className="mb-2 flex flex-wrap gap-1">
                {CHART_RANGES.map((r) => (
                  <button
                    key={r}
                    onClick={() => setRange(r)}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-xs font-semibold transition",
                      r === range
                        ? "bg-primary text-primary-foreground"
                        : "bg-background/60 text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {r}
                  </button>
                ))}
              </div>

              {/* Chart */}
              <div className="h-64 w-full">
                {chartLoading && chartData.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-muted-foreground">
                    <Loader2 className="mr-2 size-5 animate-spin" /> Loading chart…
                  </div>
                ) : chartData.length > 1 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 8, right: 6, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="coinFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={stroke} stopOpacity={0.32} />
                          <stop offset="100%" stopColor={stroke} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="oklch(0 0 0 / 8%)" vertical={false} />
                      <XAxis
                        dataKey="t"
                        type="number"
                        domain={["dataMin", "dataMax"]}
                        scale="time"
                        tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                        tickFormatter={(t) =>
                          new Date(t).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            ...(range === "1H" || range === "24H"
                              ? { hour: "2-digit", minute: "2-digit", month: undefined, day: undefined }
                              : {}),
                          })
                        }
                        minTickGap={48}
                      />
                      <YAxis
                        domain={["auto", "auto"]}
                        width={64}
                        tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                        tickFormatter={(v) => fmtPrice(Number(v))}
                      />
                      <RTooltip
                        contentStyle={{
                          background: "var(--popover)",
                          border: "1px solid var(--border)",
                          borderRadius: 12,
                          fontSize: 12,
                        }}
                        labelFormatter={(t) => new Date(Number(t)).toLocaleString()}
                        formatter={(v: any) => [fmtPrice(Number(v)), "Price"]}
                      />
                      <Area type="monotone" dataKey="price" stroke={stroke} strokeWidth={2} fill="url(#coinFill)" />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-border/60 text-xs text-muted-foreground">
                    <BarChart3 className="mr-2 size-4" /> Price history unavailable
                  </div>
                )}
              </div>

              {/* Key metrics */}
              <div className="mt-5">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Key metrics
                </p>
                {loading || !detail ? (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <Skeleton key={i} className="h-16 rounded-xl" />
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <Metric label="Market Cap" value={fmtCompactUsd(detail.marketCap)} />
                    <Metric label="Fully Diluted Val" value={fmtCompactUsd(detail.fdv)} />
                    <Metric label="24h Volume" value={fmtCompactUsd(detail.volume24h)} />
                    <Metric
                      label="Circulating"
                      value={fmtCompactNum(detail.circulatingSupply)}
                      sub={supplyPct != null ? `${supplyPct.toFixed(0)}% of max` : detail.symbol}
                    />
                    <Metric label="Total Supply" value={fmtCompactNum(detail.totalSupply)} />
                    <Metric
                      label="Max Supply"
                      value={detail.maxSupply ? fmtCompactNum(detail.maxSupply) : "∞"}
                    />
                    <Metric
                      label="All-Time High"
                      value={fmtPrice(detail.ath)}
                      sub={
                        detail.athChangePct != null
                          ? `${fmtPct(detail.athChangePct)} · ${fmtShortDate(detail.athDate)}`
                          : fmtShortDate(detail.athDate)
                      }
                    />
                    <Metric
                      label="All-Time Low"
                      value={fmtPrice(detail.atl)}
                      sub={
                        detail.atlChangePct != null
                          ? `${fmtPct(detail.atlChangePct)} · ${fmtShortDate(detail.atlDate)}`
                          : fmtShortDate(detail.atlDate)
                      }
                    />
                  </div>
                )}
              </div>

              {/* Short-window changes */}
              {detail && (
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    { label: "1h", v: detail.change1h },
                    { label: "24h", v: detail.change24h },
                    { label: "7d", v: detail.change7d },
                    { label: "30d", v: detail.change30d },
                  ].map((c) => (
                    <div key={c.label} className="rounded-xl border border-border/60 bg-background/40 px-3 py-2 text-center">
                      <p className="text-[0.6rem] uppercase tracking-wide text-muted-foreground">{c.label}</p>
                      <p className={cn("tnum text-sm font-semibold", pctColor(c.v))}>{fmtPct(c.v)}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* About */}
              {detail?.description && (
                <div className="mt-5">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    About {detail.name}
                  </p>
                  <p className="text-sm leading-relaxed text-muted-foreground">{detail.description}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {detail.homepage && (
                      <a href={detail.homepage} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-border/60 bg-background/40 px-2.5 py-1 text-xs hover:border-primary/40">
                        <Globe className="size-3.5" /> Website
                      </a>
                    )}
                    {detail.explorer && (
                      <a href={detail.explorer} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-border/60 bg-background/40 px-2.5 py-1 text-xs hover:border-primary/40">
                        <ExternalLink className="size-3.5" /> Explorer
                      </a>
                    )}
                    {detail.twitter && (
                      <a href={detail.twitter} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-border/60 bg-background/40 px-2.5 py-1 text-xs hover:border-primary/40">
                        <Twitter className="size-3.5" /> Twitter
                      </a>
                    )}
                    {detail.github && (
                      <a href={detail.github} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-border/60 bg-background/40 px-2.5 py-1 text-xs hover:border-primary/40">
                        <Github className="size-3.5" /> GitHub
                      </a>
                    )}
                  </div>
                </div>
              )}

              {/* Analyze with Crypto Bot */}
              {detail && (
                <div className="mt-5 border-t border-border/60 pt-4">
                  {!showAnalysis ? (
                    <Button onClick={() => setShowAnalysis(true)} className="w-full gap-1.5 font-semibold sm:w-auto">
                      <Sparkles className="size-4" /> Analyze {detail.symbol} with Crypto Bot
                    </Button>
                  ) : (
                    <div className="h-[420px]">
                      <TickerAnalysisPane symbol={detail.symbol} name={detail.name} botName="Koins" />
                    </div>
                  )}
                </div>
              )}

              <p className="mt-4 text-center text-[0.62rem] text-muted-foreground">
                Data via Swyftx (may be delayed up to ~60s)
              </p>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
