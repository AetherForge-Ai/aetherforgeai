"use client";

import { useMemo, useState } from "react";
import {
  getProjectionLeaders,
  formatMarketPrice,
  type SecurityIntel,
} from "@/lib/market-intel";
import { cn } from "@/lib/utils";
import { pctClass, fmtPct, SignalBadge, MarketChip } from "@/components/dashboard/intel-ui";
import { useMarketIntel } from "@/components/dashboard/MarketIntelContext";
import { LineChart, TrendingUp } from "lucide-react";
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

export function ProjectionsPanel() {
  const { universe } = useMarketIntel();
  // Analyse the whole NZX + ASX (+ US) universe and surface the 10 best-conviction
  // 7-day projected movers.
  const leaders = useMemo(() => getProjectionLeaders(10, universe ?? undefined), [universe]);
  const analysedCount = universe?.length ?? 0;
  const [selected, setSelected] = useState<string>("");
  const sel = leaders.find((l) => l.ticker === selected) ?? leaders[0];

  if (!sel) return null;

  return (
    <section className="rounded-3xl border border-border/70 bg-card/50 p-6">
      <div className="flex items-center gap-3">
        <span className="grid size-9 place-items-center rounded-lg bg-primary/12 text-primary">
          <LineChart className="size-4" />
        </span>
        <div>
          <h2 className="font-display text-lg font-bold">7-day projections</h2>
          <p className="text-xs text-muted-foreground">
            Regression + technical model{analysedCount ? ` · ${analysedCount} NZX & ASX securities analysed` : ""} · 10 best · next 7 sessions
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-6 lg:grid-cols-[1fr_1.5fr]">
        {/* Leaders list */}
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Top 10 projected movers</p>
          {leaders.map((l) => {
            const active = l.ticker === sel.ticker;
            return (
              <button
                key={l.ticker}
                onClick={() => setSelected(l.ticker)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors",
                  active ? "border-primary/50 bg-primary/8" : "border-border/60 bg-background/30 hover:bg-background/50"
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-display text-sm font-semibold">{l.ticker.replace(/\.(NZ|AX)$/, "")}</span>
                    <MarketChip market={l.market} />
                  </div>
                  <p className="truncate text-[0.66rem] text-muted-foreground">{l.name}</p>
                </div>
                <div className="text-right">
                  <p className={cn("tnum text-sm font-bold", pctClass(l.projected7dPct))}>{fmtPct(l.projected7dPct)}</p>
                  <p className="text-[0.62rem] text-muted-foreground">{l.confidence}% conf.</p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Selected detail */}
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-display text-xl font-bold">{sel.ticker.replace(/\.(NZ|AX)$/, "")}</h3>
                <SignalBadge signal={sel.signal} />
              </div>
              <p className="text-xs text-muted-foreground">{sel.name} · {sel.sector}</p>
            </div>
            <div className="text-right">
              <p className="tnum font-display text-lg font-bold">{formatMarketPrice(sel.price, sel.currency)}</p>
              <p className={cn("tnum text-xs font-semibold", pctClass(sel.projected7dPct))}>
                <TrendingUp className="mr-0.5 inline size-3" /> {fmtPct(sel.projected7dPct)} projected · {sel.confidence}% confidence
              </p>
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
    </section>
  );
}
