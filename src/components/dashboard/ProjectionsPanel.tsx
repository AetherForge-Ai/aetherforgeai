"use client";

import { useMemo, useState } from "react";
import {
  getProjectionMovers,
  formatMarketPrice,
  type AssetClass,
  type SecurityIntel,
} from "@/lib/market-intel";
import { cn } from "@/lib/utils";
import { pctClass, fmtPct, SignalBadge, ExchangeChip } from "@/components/dashboard/intel-ui";
import { useMarketIntel } from "@/components/dashboard/MarketIntelContext";
import { BuyDialog, type BuyTarget } from "@/components/dashboard/BuyDialog";
import { Button } from "@/components/ui/button";
import {
  LineChart,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Loader2,
  ShoppingCart,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart as RLineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from "recharts";

function Indicator({
  label,
  value,
  tone = "neutral",
  hint,
}: {
  label: string;
  value: string;
  tone?: "up" | "down" | "neutral";
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/40 px-3 py-2.5">
      <p className="text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={cn(
          "tnum mt-1 font-display text-base font-bold",
          tone === "up" && "text-emerald-400",
          tone === "down" && "text-rose-400"
        )}
      >
        {value}
      </p>
      {hint && <p className="text-[0.62rem] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function ProjectionChart({ sel }: { sel: SecurityIntel }) {
  const data = useMemo(() => {
    const hist = sel.history.map((p, i) => ({
      label: p.label,
      actual: p.price,
      projected: i === sel.history.length - 1 ? p.price : undefined,
    }));
    const proj = sel.projection.map((p) => ({ label: p.label, actual: undefined, projected: p.price }));
    return [...hist, ...proj];
  }, [sel]);

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <RLineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} interval="preserveStartEnd" tickLine={false} axisLine={false} minTickGap={24} />
          <YAxis
            tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
            tickLine={false}
            axisLine={false}
            domain={["auto", "auto"]}
            width={52}
            tickFormatter={(v: number) => formatMarketPrice(v, sel.currency).replace(/[^0-9.,]/g, "")}
          />
          <Tooltip
            contentStyle={{
              background: "var(--popover)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              fontSize: 12,
            }}
            labelStyle={{ color: "var(--muted-foreground)" }}
            formatter={(value: number, name: string) => [
              formatMarketPrice(value, sel.currency),
              name === "actual" ? "Price" : "Projection",
            ]}
          />
          <ReferenceLine y={sel.sma20} stroke="var(--gold)" strokeDasharray="4 4" strokeOpacity={0.5} />
          <ReferenceLine y={sel.sma50} stroke="oklch(0.7 0.14 250)" strokeDasharray="2 4" strokeOpacity={0.55} />
          <Line type="monotone" dataKey="actual" stroke="var(--primary)" strokeWidth={2.2} dot={false} connectNulls />
          <Line
            type="monotone"
            dataKey="projected"
            stroke="var(--chart-4)"
            strokeWidth={2.2}
            strokeDasharray="5 4"
            dot={false}
            connectNulls
          />
        </RLineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ProjectionsPanel({
  assetClass = "stock",
  onBought,
}: {
  assetClass?: AssetClass;
  onBought?: () => void;
}) {
  const { universe, refresh, refreshing, lastUpdated } = useMarketIntel();
  // Analyse the whole cross-market universe (NZX, ASX, Dow Jones, NASDAQ) and
  // surface the 15 strongest short-term movers overall — ranked by projected
  // strength weighted by model confidence.
  const leaders = useMemo(() => getProjectionMovers(15, universe ?? undefined), [universe]);
  const analysedCount = universe?.length ?? 0;
  const [selected, setSelected] = useState<string>("");
  const sel = leaders.find((l) => l.ticker === selected) ?? leaders[0];

  const [buyTarget, setBuyTarget] = useState<BuyTarget | null>(null);
  const [buyOpen, setBuyOpen] = useState(false);

  function openBuy(s: SecurityIntel) {
    setBuyTarget({ ticker: s.ticker, name: s.name, assetType: assetClass, price: s.price });
    setBuyOpen(true);
  }

  if (!sel) return null;

  return (
    <section className="rounded-3xl border border-border/70 bg-card/50 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-lg bg-primary/12 text-primary">
            <LineChart className="size-4" />
          </span>
          <div>
            <h2 className="font-display text-lg font-bold">7-day projections</h2>
            <p className="text-xs text-muted-foreground">
              Cross-market model · NZX, ASX, Dow Jones &amp; NASDAQ{analysedCount ? ` · ${analysedCount} securities analysed` : ""} · top 15 movers · next 7 sessions
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 px-3 text-xs"
          onClick={() => refresh()}
          disabled={refreshing}
        >
          {refreshing ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
          Refresh
        </Button>
      </div>

      <div className="mt-5 grid gap-6 lg:grid-cols-[1fr_1.5fr]">
        {/* Leaders list */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Top 15 projected movers</p>
            {lastUpdated && <p className="text-[0.6rem] text-muted-foreground">Updated {lastUpdated}</p>}
          </div>
          <div className="max-h-[26rem] space-y-2 overflow-y-auto pr-1">
            {leaders.map((l, i) => {
              const active = l.ticker === sel.ticker;
              const up = l.projected7dPct >= 0;
              return (
                <button
                  key={l.ticker}
                  onClick={() => setSelected(l.ticker)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors",
                    active ? "border-primary/50 bg-primary/8" : "border-border/60 bg-background/30 hover:bg-background/50"
                  )}
                >
                  <span className="tnum grid size-6 shrink-0 place-items-center rounded-md bg-muted/50 text-[0.62rem] font-bold text-muted-foreground">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-display text-sm font-semibold">{l.ticker.replace(/\.(NZ|AX)$/, "")}</span>
                      <ExchangeChip ticker={l.ticker} market={l.market} />
                    </div>
                    <p className="truncate text-[0.66rem] text-muted-foreground">{l.name}</p>
                  </div>
                  <div className="text-right">
                    <p className={cn("tnum flex items-center justify-end gap-0.5 text-sm font-bold", pctClass(l.projected7dPct))}>
                      {up ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
                      {fmtPct(l.projected7dPct)}
                    </p>
                    <p className="text-[0.62rem] text-muted-foreground">{l.confidence}% conf.</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected detail */}
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-display text-xl font-bold">{sel.ticker.replace(/\.(NZ|AX)$/, "")}</h3>
                <ExchangeChip ticker={sel.ticker} market={sel.market} />
                <SignalBadge signal={sel.signal} />
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.62rem] font-bold uppercase tracking-wide",
                    sel.projected7dPct >= 0
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                      : "border-rose-500/30 bg-rose-500/10 text-rose-300"
                  )}
                >
                  {sel.projected7dPct >= 0 ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
                  {sel.projected7dPct >= 0 ? "Upside" : "Downside"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{sel.name} · {sel.sector}</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="tnum font-display text-lg font-bold">{formatMarketPrice(sel.price, sel.currency)}</p>
                <p className={cn("tnum text-xs font-semibold", pctClass(sel.projected7dPct))}>
                  {fmtPct(sel.projected7dPct)} projected · {sel.confidence}% confidence
                </p>
              </div>
              <Button size="sm" className="h-9 gap-1.5 px-3 font-semibold shadow-glow" onClick={() => openBuy(sel)}>
                <ShoppingCart className="size-4" /> Buy
              </Button>
            </div>
          </div>

          <div className="mt-4">
            <ProjectionChart sel={sel} />
            <div className="mt-1 flex items-center gap-4 text-[0.62rem] text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-primary" /> Price (30d)</span>
              <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 border-t-2 border-dashed" style={{ borderColor: "var(--chart-4)" }} /> Projection (7d)</span>
              <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 border-t-2 border-dashed" style={{ borderColor: "var(--gold)" }} /> SMA20</span>
              <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 border-t-2 border-dashed" style={{ borderColor: "oklch(0.7 0.14 250)" }} /> SMA50</span>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <Indicator
              label="RSI (14)"
              value={sel.rsi.toFixed(0)}
              tone={sel.rsi >= 70 ? "down" : sel.rsi <= 30 ? "up" : "neutral"}
              hint={sel.rsi >= 70 ? "Overbought" : sel.rsi <= 30 ? "Oversold" : "Neutral"}
            />
            <Indicator
              label="MACD"
              value={sel.macdSignal}
              tone={sel.macdSignal === "Bullish" ? "up" : sel.macdSignal === "Bearish" ? "down" : "neutral"}
              hint={`Hist ${sel.macdHistogram > 0 ? "+" : ""}${sel.macdHistogram}`}
            />
            <Indicator label="BB position" value={`${sel.bbPosition.toFixed(0)}%`} hint="within band" />
            <Indicator
              label="vs SMA20"
              value={fmtPct(sel.vsSma20)}
              tone={sel.vsSma20 >= 0 ? "up" : "down"}
              hint={sel.vsSma20 >= 0 ? "Above trend" : "Below trend"}
            />
          </div>

          {/* Plain-English reasoning for the projection */}
          <div className="mt-4 rounded-xl border border-primary/25 bg-primary/8 p-3.5">
            <p className="flex items-center gap-1.5 text-[0.65rem] font-semibold uppercase tracking-wide text-primary">
              <TrendingUp className="size-3.5" /> Why this projection
            </p>
            <p className="mt-1.5 text-sm leading-relaxed text-foreground/90">{sel.reasoning}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              Projected <span className={cn("font-semibold", pctClass(sel.projected7dPct))}>{fmtPct(sel.projected7dPct)}</span> over
              the next 7 sessions at {sel.confidence}% model confidence · conviction score {sel.score}/100.
            </p>
          </div>
        </div>
      </div>

      <BuyDialog
        open={buyOpen}
        onOpenChange={setBuyOpen}
        target={buyTarget}
        onDone={() => {
          setBuyOpen(false);
          onBought?.();
        }}
      />
    </section>
  );
}
