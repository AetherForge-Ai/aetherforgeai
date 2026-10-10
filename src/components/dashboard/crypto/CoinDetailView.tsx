"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { formatDisplayClock, formatDisplayDate, formatDisplayDateTime } from "@/lib/currency";
import { clientFacingError } from "@/lib/api-json";
import { PUBLIC_COIN_SOURCE_LINE, publicCoinDescription } from "@/lib/data-sources";
import { paperAddSignupHref } from "@/lib/paper-add-link";
import { cn } from "@/lib/utils";
import { TickerAnalysisPane } from "@/components/dashboard/TickerAnalysisPane";
import { BuyDialog, type BuyTarget } from "@/components/dashboard/BuyDialog";
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
  ShoppingCart,
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
  COIN_DETAIL_SOURCE_DOWN,
  COIN_DETAIL_UNAVAILABLE,
  resolvableCoinId,
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

export function CoinDetailView({
  coinId,
  active = true,
  allowBuy = false,
  signedIn: signedInProp,
  openFromQuery = false,
  paperMarket = "Crypto",
  unavailable = false,
  variant = "page",
}: {
  coinId: string | null;
  /** False while a dialog is closed so it does not fetch in the background. */
  active?: boolean;
  /** Page sets this only when the viewer is signed in and the query is buy=1. */
  allowBuy?: boolean;
  /** Public pages pass the session. The dashboard dialog is a member. */
  signedIn?: boolean;
  /** True only when the page query is buy=1. Does not open the panel by itself. */
  openFromQuery?: boolean;
  paperMarket?: "Crypto" | "DEX";
  /** DEX row with no CoinGecko id. Do not call the coin API. */
  unavailable?: boolean;
  variant?: "page" | "dialog";
}) {
  const signedIn = signedInProp ?? variant === "dialog";
  const slug = resolvableCoinId(coinId);
  const blocked = unavailable || !slug;
  const gradientId = useId().replace(/:/g, "");

  const [detail, setDetail] = useState<CoinDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [range, setRange] = useState<ChartRange>("7D");
  const [chart, setChart] = useState<CoinChart | null>(null);
  const [chartLoading, setChartLoading] = useState(false);
  const [chartCache, setChartCache] = useState<Record<string, CoinChart>>({});

  const [showAnalysis, setShowAnalysis] = useState(false);
  const [buyOpen, setBuyOpen] = useState(false);
  const [buyTarget, setBuyTarget] = useState<BuyTarget | null>(null);

  const loadDetail = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    console.log(`[coin-detail] loading ${id}`);
    try {
      const res = await api.get<CoinDetail>(`/api/crypto/coin/${encodeURIComponent(id)}`);
      if (res.ok && res.data && typeof res.data.price === "number" && res.data.price > 0) {
        setDetail(res.data);
      } else {
        setError(clientFacingError(`/api/crypto/coin/${id}`, res.error || COIN_DETAIL_SOURCE_DOWN));
        setDetail(null);
      }
    } catch {
      setError(COIN_DETAIL_SOURCE_DOWN);
      setDetail(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!active) return;
    setDetail(null);
    setChart(null);
    setChartCache({});
    setRange("7D");
    setShowAnalysis(false);
    if (blocked || !slug) {
      setLoading(false);
      setError(COIN_DETAIL_UNAVAILABLE);
      return;
    }
    void loadDetail(slug).catch(() => {
      setError(COIN_DETAIL_SOURCE_DOWN);
      setLoading(false);
    });
  }, [active, blocked, slug, loadDetail]);

  useEffect(() => {
    if (!active || blocked || !slug) return;
    const days = RANGE_TO_DAYS[range];
    const key = `${slug}:${days}`;
    if (chartCache[key]) {
      setChart(chartCache[key]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        setChartLoading(true);
        const res = await api.get<CoinChart>(`/api/crypto/chart/${encodeURIComponent(slug)}?days=${days}`);
        if (cancelled) return;
        if (res.ok && res.data && Array.isArray(res.data.prices)) {
          setChart(res.data);
          setChartCache((c) => ({ ...c, [key]: res.data as CoinChart }));
        }
      } catch {
        /* chart is optional; a failure must not surface a parse exception */
      } finally {
        if (!cancelled) setChartLoading(false);
      }
    })().catch(() => {
      if (!cancelled) setChartLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [active, blocked, slug, range, chartCache]);

  useEffect(() => {
    if (variant !== "page" || !detail?.name) return;
    const prev = document.title;
    document.title = `${detail.name} (${detail.symbol}) · Crypto markets`;
    return () => {
      document.title = prev;
    };
  }, [variant, detail]);

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

  const canAdd = !!detail && detail.price > 0;
  const openedFromQuery = useRef(false);

  useEffect(() => {
    if (!signedIn || !openFromQuery || openedFromQuery.current || !allowBuy || !detail || !(detail.price > 0)) return;
    openedFromQuery.current = true;
    setBuyTarget({
      ticker: detail.symbol,
      name: detail.name,
      assetType: "crypto",
      price: detail.price,
      coinId: detail.id,
      market: paperMarket,
    });
    setBuyOpen(true);
  }, [signedIn, openFromQuery, allowBuy, detail, paperMarket]);
  const shownError = blocked ? COIN_DETAIL_UNAVAILABLE : error;

  function openBuy() {
    if (!detail || !(detail.price > 0)) return;
    setBuyTarget({
      ticker: detail.symbol,
      name: detail.name,
      assetType: "crypto",
      price: detail.price,
      coinId: detail.id,
      market: paperMarket,
    });
    setBuyOpen(true);
  }

  const signupHref = paperAddSignupHref({
    coinId: detail?.id || coinId,
    symbol: detail?.symbol,
    name: detail?.name,
    market: paperMarket,
  });

  const title = !detail && shownError && !loading ? (
    variant === "dialog" ? (
      <DialogTitle className="font-display text-xl">Crypto</DialogTitle>
    ) : (
      <h1 className="font-display text-xl font-semibold">Crypto</h1>
    )
  ) : loading || !detail ? (
    <div className="flex items-center gap-3">
      {variant === "dialog" ? (
        <DialogTitle className="sr-only">Loading coin</DialogTitle>
      ) : (
        <h1 className="sr-only">Crypto</h1>
      )}
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
          alt=""
          className="size-9 rounded-full"
          onError={(e) => {
            const t = e.currentTarget;
            if (t.dataset.fb) return;
            t.dataset.fb = "1";
            t.src = GENERIC_COIN_ICON;
          }}
        />
        <div>
          {variant === "dialog" ? (
            <DialogTitle className="flex items-center gap-2 font-display text-xl">
              {detail.name}
              <span className="text-sm font-semibold text-muted-foreground">{detail.symbol}</span>
              {detail.rank ? (
                <span className="rounded-md bg-primary/12 px-2 py-0.5 text-[0.62rem] font-bold uppercase tracking-wide text-primary">
                  Rank #{detail.rank}
                </span>
              ) : null}
            </DialogTitle>
          ) : (
            <h1 className="flex items-center gap-2 font-display text-xl font-semibold">
              {detail.name}
              <span className="text-sm font-semibold text-muted-foreground">({detail.symbol})</span>
              {detail.rank ? (
                <span className="rounded-md bg-primary/12 px-2 py-0.5 text-[0.62rem] font-bold uppercase tracking-wide text-primary">
                  Rank #{detail.rank}
                </span>
              ) : null}
            </h1>
          )}
          {variant === "dialog" ? (
            <DialogDescription className="sr-only">
              Live market data and price chart for {detail.name}
            </DialogDescription>
          ) : (
            <p className="sr-only">Live market data and price chart for {detail.name}</p>
          )}
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
        {canAdd && (
          <div className="mt-2">
            {signedIn ? (
              <Button size="sm" variant="outline" onClick={openBuy} className="gap-1.5 font-semibold">
                <ShoppingCart className="size-3.5" /> Add to paper book
              </Button>
            ) : (
              <Button asChild size="sm" variant="outline" className="gap-1.5 font-semibold">
                <Link href={signupHref}>
                  <ShoppingCart className="size-3.5" /> Add to paper book
                </Link>
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );

  const body = shownError ? (
    <div className="flex h-56 flex-col items-center justify-center gap-3 text-center text-sm text-muted-foreground">
      {shownError}
      {!blocked && slug && (
        <Button variant="outline" size="sm" onClick={() => loadDetail(slug)}>
          Try again
        </Button>
      )}
    </div>
  ) : (
    <>
      <div className="mb-2 flex flex-wrap gap-1">
        {CHART_RANGES.map((r) => (
          <button
            key={r}
            type="button"
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

      <div className="h-64 w-full">
        {chartLoading && chartData.length === 0 ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <Loader2 className="mr-2 size-5 animate-spin" /> Loading chart…
          </div>
        ) : chartData.length > 1 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 8, right: 6, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
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
                tickFormatter={(t) => {
                  const date = new Date(t);
                  if (range === "1H" || range === "24H") return formatDisplayClock(date);
                  const wall = formatDisplayDate(date);
                  return wall.replace(/ \d{4}$/, "");
                }}
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
                labelFormatter={(t) => formatDisplayDateTime(new Date(Number(t)))}
                formatter={(v) => [fmtPrice(Number(v)), "Price"]}
              />
              <Area type="monotone" dataKey="price" stroke={stroke} strokeWidth={2} fill={`url(#${gradientId})`} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-border/60 text-xs text-muted-foreground">
            <BarChart3 className="mr-2 size-4" /> Price history is not shown for this range
          </div>
        )}
      </div>

      <div className="mt-5">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Key metrics</p>
        {loading || !detail ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(detail.marketCap ?? 0) > 0 ? <Metric label="Market Cap" value={fmtCompactUsd(detail.marketCap)} /> : null}
            {(detail.fdv ?? 0) > 0 ? <Metric label="Fully Diluted Val" value={fmtCompactUsd(detail.fdv)} /> : null}
            {(detail.volume24h ?? 0) > 0 ? <Metric label="24h Volume" value={fmtCompactUsd(detail.volume24h)} /> : null}
            {(detail.circulatingSupply ?? 0) > 0 ? (
              <Metric
                label="Circulating"
                value={fmtCompactNum(detail.circulatingSupply)}
                sub={supplyPct != null ? `${supplyPct.toFixed(0)}% of max` : detail.symbol}
              />
            ) : null}
            {(detail.totalSupply ?? 0) > 0 ? (
              <Metric label="Total Supply" value={fmtCompactNum(detail.totalSupply)} />
            ) : null}
            <Metric
              label="Max Supply"
              value={
                detail.maxSupply != null && Number.isFinite(detail.maxSupply) && detail.maxSupply > 0
                  ? fmtCompactNum(detail.maxSupply)
                  : "Not available"
              }
            />
            {(detail.ath ?? 0) > 0 ? (
              <Metric
                label="All-Time High"
                value={fmtPrice(detail.ath)}
                sub={
                  detail.athChangePct != null
                    ? `${fmtPct(detail.athChangePct)} · ${fmtShortDate(detail.athDate)}`
                    : fmtShortDate(detail.athDate)
                }
              />
            ) : null}
            {(detail.atl ?? 0) > 0 ? (
              <Metric
                label="All-Time Low"
                value={fmtPrice(detail.atl)}
                sub={
                  detail.atlChangePct != null
                    ? `${fmtPct(detail.atlChangePct)} · ${fmtShortDate(detail.atlDate)}`
                    : fmtShortDate(detail.atlDate)
                }
              />
            ) : null}
          </div>
        )}
      </div>

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

      {detail?.description && (
        <div className="mt-5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            About {detail.name}
          </p>
          <p className="text-sm leading-relaxed text-muted-foreground">{publicCoinDescription(detail.description)}</p>
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

      {detail && (
        <div className="mt-5 border-t border-border/60 pt-4">
          {!showAnalysis ? (
            <Button onClick={() => setShowAnalysis(true)} className="w-full gap-1.5 font-semibold sm:w-auto">
              <Sparkles className="size-4" /> Analyse {detail.symbol} with Koins
            </Button>
          ) : (
            <div className="h-[420px]">
              <TickerAnalysisPane symbol={detail.symbol} name={detail.name} botName="Koins" />
            </div>
          )}
        </div>
      )}

      <p className="mt-4 text-center text-[0.62rem] text-muted-foreground">
        {PUBLIC_COIN_SOURCE_LINE}
      </p>
    </>
  );

  return (
    <>
      <div className={cn("flex flex-col", variant === "dialog" && "min-h-0 flex-1")}>
        {variant === "dialog" ? (
          <DialogHeader className="border-b border-border/60 px-5 py-4 text-left sm:px-6">{title}</DialogHeader>
        ) : (
          <header className="border-b border-border/60 px-5 py-4 sm:px-6">{title}</header>
        )}
        <div className={cn("px-5 py-4 sm:px-6", variant === "dialog" && "min-h-0 flex-1 overflow-y-auto")}>
          {body}
        </div>
      </div>
      {signedIn ? (
        <BuyDialog
          open={buyOpen}
          onOpenChange={setBuyOpen}
          target={buyTarget}
          onDone={() => setBuyOpen(false)}
        />
      ) : null}
    </>
  );
}
