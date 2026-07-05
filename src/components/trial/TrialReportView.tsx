"use client";

import { useMemo } from "react";
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
  Download,
  Mail,
  Sparkles,
  TrendingUp,
  TrendingDown,
  Newspaper,
  Target,
  Gauge,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  TrialReport,
  TrialTickerAnalysis,
  MoverEntry,
  ForwardPrediction,
} from "@/lib/trial-types";

/* ------------------------------ format utils ---------------------------- */

function fmtPrice(v: number): string {
  const dp = Math.abs(v) < 5 ? 4 : 2;
  return "$" + v.toLocaleString("en-NZ", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}
function fmtPct(v: number): string {
  return `${v > 0 ? "+" : ""}${(v ?? 0).toFixed(2)}%`;
}
function pctClass(v: number): string {
  return v > 0 ? "text-emerald-400" : v < 0 ? "text-rose-400" : "text-muted-foreground";
}

const SIGNAL_STYLE: Record<TrialTickerAnalysis["signal"], string> = {
  "Strong Buy": "bg-emerald-500/15 text-emerald-400 ring-emerald-500/30",
  Accumulate: "bg-cyan-500/15 text-cyan-300 ring-cyan-500/30",
  Hold: "bg-violet-500/15 text-violet-300 ring-violet-500/30",
  Watch: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  Reduce: "bg-rose-500/15 text-rose-400 ring-rose-500/30",
};

/* ------------------------------ small bits ------------------------------ */

function Stat({ label, value, tone }: { label: string; value: string; tone?: number }) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/40 px-3 py-2.5 text-center">
      <p className="text-[0.6rem] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("tnum mt-1 font-display text-sm font-bold", tone != null ? pctClass(tone) : "text-foreground")}>
        {value}
      </p>
    </div>
  );
}

function MoverList({ title, entries, accent }: { title: string; entries: MoverEntry[]; accent: string }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/40">
      <div className={cn("px-4 py-2.5 text-xs font-bold uppercase tracking-wide", accent)}>{title}</div>
      <ul className="divide-y divide-border/50">
        {entries.slice(0, 8).map((m, i) => (
          <li key={m.symbol + i} className="flex items-center gap-2 px-4 py-2 text-sm">
            <span className="w-4 shrink-0 text-[0.7rem] text-muted-foreground">{i + 1}</span>
            {m.image ? (
              <img src={m.image} alt="" className="size-4 shrink-0 rounded-full" />
            ) : null}
            <span className="min-w-0 flex-1 truncate">
              <span className="font-semibold">{m.symbol}</span>{" "}
              <span className="text-xs text-muted-foreground">{m.name}</span>
            </span>
            <span className="tnum shrink-0 font-mono text-xs text-muted-foreground">{fmtPrice(m.price)}</span>
            <span className={cn("tnum w-16 shrink-0 text-right text-xs font-bold", pctClass(m.changePct))}>
              {fmtPct(m.changePct)}
            </span>
          </li>
        ))}
        {!entries.length && <li className="px-4 py-3 text-xs text-muted-foreground">No data available.</li>}
      </ul>
    </div>
  );
}

function MomentumChart({ t }: { t: TrialTickerAnalysis }) {
  const data = useMemo(() => t.momentum12mo.map((p) => ({ label: p.label, value: p.value })), [t.momentum12mo]);
  const positive = t.momentum12moPct >= 0;
  const color = positive ? "#34d399" : "#fb7185";
  if (!data.length) {
    return <div className="grid h-[140px] place-items-center text-xs text-muted-foreground">12-month history unavailable.</div>;
  }
  return (
    <div className="h-[140px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
          <defs>
            <linearGradient id={`mom-${t.symbol}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.4} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 9, fill: "#64748b" }} interval="preserveStartEnd" tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 9, fill: "#64748b" }} width={44} domain={["auto", "auto"]} tickLine={false} axisLine={false} tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`)} />
          <Tooltip
            contentStyle={{ background: "#0e1526", border: "1px solid #1e2942", borderRadius: 10, fontSize: 12 }}
            labelStyle={{ color: "#93a1bd" }}
            formatter={(v: number) => [fmtPrice(v), "Price"]}
          />
          <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2} fill={`url(#mom-${t.symbol})`} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function PredictionPill({ p }: { p: ForwardPrediction }) {
  const Icon = p.direction === "up" ? ArrowUpRight : p.direction === "down" ? ArrowDownRight : Minus;
  const tone = p.direction === "up" ? "text-emerald-400" : p.direction === "down" ? "text-rose-400" : "text-muted-foreground";
  return (
    <div className="flex-1 rounded-xl border border-border/60 bg-background/40 p-3">
      <div className="flex items-center justify-between text-[0.62rem] uppercase tracking-wide text-muted-foreground">
        <span>{p.horizon} outlook</span>
        <span>{p.confidence}% conf</span>
      </div>
      <div className={cn("mt-1 flex items-center gap-1 font-display text-lg font-extrabold", tone)}>
        <Icon className="size-4" />
        {p.expectedMovePct > 0 ? "+" : ""}
        {p.expectedMovePct.toFixed(2)}%
      </div>
      <p className="mt-1 text-[0.68rem] leading-snug text-muted-foreground">{p.rationale}</p>
    </div>
  );
}

function TickerCard({ t }: { t: TrialTickerAnalysis }) {
  return (
    <div className="rounded-3xl border border-border/70 bg-card/50 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          {t.image ? <img src={t.image} alt="" className="size-8 rounded-full" /> : null}
          <div>
            <div className="flex items-center gap-2">
              <span className="font-display text-lg font-bold">{t.symbol}</span>
              <span className={cn("rounded-full px-2 py-0.5 text-[0.62rem] font-bold uppercase ring-1", SIGNAL_STYLE[t.signal])}>
                {t.signal}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {t.name} · {t.assetClass === "crypto" ? "Digital asset" : "Equity"}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="tnum font-mono text-base font-semibold">{fmtPrice(t.price)}</p>
          <p className={cn("text-xs", pctClass(t.change24h))}>{fmtPct(t.change24h)} 24h</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-4 gap-2">
        <Stat label="24h" value={fmtPct(t.change24h)} tone={t.change24h} />
        <Stat label="7 days" value={fmtPct(t.change7d)} tone={t.change7d} />
        <Stat label="30 days" value={fmtPct(t.change30d)} tone={t.change30d} />
        <Stat label="12 mo" value={fmtPct(t.momentum12moPct)} tone={t.momentum12moPct} />
      </div>

      <div className="mt-4">
        <div className="mb-1 flex items-center justify-between text-[0.62rem] uppercase tracking-wide text-muted-foreground">
          <span>12-month continuation &amp; momentum{t.momentumIsLive ? "" : " · modelled"}</span>
          <span className={pctClass(t.momentum12moPct)}>{fmtPct(t.momentum12moPct)}</span>
        </div>
        <MomentumChart t={t} />
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <Stat label="RSI (14)" value={t.rsi != null ? t.rsi.toFixed(0) : "—"} />
        <Stat label="MACD" value={t.macdSignal ?? "—"} />
        <Stat label="Sentiment" value={`${t.sentiment}/100`} />
      </div>

      <div className="mt-4">
        <p className="mb-2 flex items-center gap-1.5 text-[0.68rem] font-semibold uppercase tracking-wide text-muted-foreground">
          <Target className="size-3.5" /> Fact-based next-move predictions
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          {t.predictions.map((p) => (
            <PredictionPill key={p.horizon} p={p} />
          ))}
        </div>
      </div>

      {t.holding && (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Position" value={`${t.holding.shares} @ ${fmtPrice(t.holding.avgPrice)}`} />
          <Stat label="Value" value={fmtPrice(t.holding.value)} />
          <Stat label="P&L" value={`${t.holding.pnl >= 0 ? "+" : ""}${fmtPrice(t.holding.pnl)}`} tone={t.holding.pnl} />
          <Stat label="Return" value={fmtPct(t.holding.pnlPct)} tone={t.holding.pnlPct} />
        </div>
      )}

      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">{renderInline(t.note)}</p>
    </div>
  );
}

/** Render tiny **bold** markdown inline. */
function renderInline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith("**") && p.endsWith("**") ? (
      <strong key={i} className="font-semibold text-foreground">
        {p.slice(2, -2)}
      </strong>
    ) : (
      <span key={i}>{p}</span>
    )
  );
}

/* -------------------------------- View ---------------------------------- */

export function TrialReportView({
  report,
  pdfUrl,
  email,
  emailed,
}: {
  report: TrialReport;
  pdfUrl: string | null;
  email: string;
  emailed: boolean;
}) {
  const accent = report.bot === "crypto" ? "text-cyan-300" : "text-violet-300";

  return (
    <div className="space-y-6">
      {/* Delivery banner */}
      <div className="flex flex-col gap-3 rounded-3xl border border-emerald-500/30 bg-emerald-500/10 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-emerald-500/20 text-emerald-400">
            <Mail className="size-5" />
          </span>
          <div>
            <p className="font-semibold">
              {emailed ? "Report delivered to your inbox" : "Report generated"}
            </p>
            <p className="text-sm text-muted-foreground">
              {emailed ? (
                <>
                  A full PDF copy was emailed to <span className="font-medium text-foreground">{email}</span>.
                </>
              ) : (
                <>We couldn&apos;t email it, but your full report is below.</>
              )}
            </p>
          </div>
        </div>
        {pdfUrl && (
          <a
            href={pdfUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-foreground px-4 py-2.5 text-sm font-semibold text-background transition-opacity hover:opacity-90"
          >
            <Download className="size-4" /> Download PDF
          </a>
        )}
      </div>

      {/* Header card */}
      <div className="overflow-hidden rounded-3xl border border-border/70 bg-gradient-to-br from-card/70 via-card/40 to-background/60 p-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn("inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold ring-1", report.bot === "crypto" ? "bg-cyan-500/15 text-cyan-300 ring-cyan-500/30" : "bg-violet-500/15 text-violet-300 ring-violet-500/30")}>
            <Sparkles className="size-3" /> {report.mode}
          </span>
          <span className={cn("inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ring-1", report.dataLive ? "bg-emerald-500/15 text-emerald-400 ring-emerald-500/30" : "bg-amber-500/15 text-amber-300 ring-amber-500/30")}>
            {report.dataLive ? "● Live data" : "◐ Modelled"}
          </span>
          {report.aiEnhanced && (
            <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/15 px-3 py-1 text-xs font-semibold text-violet-300 ring-1 ring-violet-500/30">
              ✨ Grok 4.3
            </span>
          )}
        </div>
        <h2 className="mt-4 font-display text-2xl font-bold sm:text-3xl">{report.title}</h2>
        <p className={cn("mt-1 text-sm font-medium", accent)}>{report.scopeLabel}</p>
        <p className="text-xs text-muted-foreground">{report.marketLabel} · {report.generatedAtLabel}</p>

        {report.portfolio && (
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Portfolio value" value={fmtPrice(report.portfolio.value)} />
            <Stat label="Cost basis" value={fmtPrice(report.portfolio.cost)} />
            <Stat label="Unrealised P&L" value={`${report.portfolio.pnl >= 0 ? "+" : ""}${fmtPrice(report.portfolio.pnl)}`} tone={report.portfolio.pnl} />
            <Stat label="Return" value={fmtPct(report.portfolio.pnlPct)} tone={report.portfolio.pnlPct} />
          </div>
        )}
      </div>

      {/* Executive summary */}
      <div className="rounded-3xl border border-border/70 bg-card/40 p-6">
        <h3 className="flex items-center gap-2 font-display text-lg font-bold">
          <Gauge className="size-5 text-primary" /> Executive summary
        </h3>
        <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
          {renderInline(report.executiveSummary)}
        </p>
        {report.keyFindings.length > 0 && (
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {report.keyFindings.map((f, i) => (
              <li key={i} className="flex items-start gap-2 rounded-xl border border-border/50 bg-background/40 px-3 py-2 text-xs leading-snug text-muted-foreground">
                <span className="mt-0.5 size-1.5 shrink-0 rounded-full bg-primary" />
                <span>{renderInline(f)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Movers */}
      {report.bot === "crypto" && report.cryptoMovers && (
        <div>
          <h3 className="mb-3 flex items-center gap-2 font-display text-lg font-bold">
            <TrendingUp className="size-5 text-emerald-400" /> Top movers · top 100 cryptocurrencies
          </h3>
          <div className="grid gap-4 md:grid-cols-2">
            <MoverList title="Top gainers · 24h" entries={report.cryptoMovers.gainers24h} accent="bg-emerald-500/10 text-emerald-400" />
            <MoverList title="Top losers · 24h" entries={report.cryptoMovers.losers24h} accent="bg-rose-500/10 text-rose-400" />
            <MoverList title="Momentum leaders · 7d" entries={report.cryptoMovers.gainers7d} accent="bg-cyan-500/10 text-cyan-300" />
            <MoverList title="Trend leaders · 30d" entries={report.cryptoMovers.gainers30d} accent="bg-violet-500/10 text-violet-300" />
          </div>
        </div>
      )}
      {report.bot === "stock" && report.stockMovers && (
        <div>
          <h3 className="mb-3 flex items-center gap-2 font-display text-lg font-bold">
            <TrendingUp className="size-5 text-emerald-400" /> NZX + ASX market movers
            <span className="text-xs font-normal text-muted-foreground">
              ({report.stockMovers.universeSize} names · {report.stockMovers.live ? "live" : "modelled"})
            </span>
          </h3>
          <div className="grid gap-4 md:grid-cols-2">
            <MoverList title="Top gainers" entries={report.stockMovers.gainers} accent="bg-emerald-500/10 text-emerald-400" />
            <MoverList title="Top losers" entries={report.stockMovers.losers} accent="bg-rose-500/10 text-rose-400" />
          </div>
        </div>
      )}

      {/* Market predictions */}
      {report.predictions.length > 0 && (
        <div className="rounded-3xl border border-border/70 bg-card/40 p-6">
          <h3 className="flex items-center gap-2 font-display text-lg font-bold">
            <Target className="size-5 text-primary" /> Fact-based predictions of next moves
          </h3>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            {report.predictions.map((p, i) => (
              <div key={i} className="rounded-2xl border border-border/60 bg-background/40 p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-foreground">{p.headline}</p>
                  <span className="shrink-0 text-[0.62rem] text-muted-foreground">{p.confidence}%</span>
                </div>
                <p className="mt-2 text-xs leading-snug text-muted-foreground">{p.detail}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Per-ticker deep analysis */}
      <div>
        <h3 className="mb-3 flex items-center gap-2 font-display text-lg font-bold">
          <TrendingDown className="size-5 text-primary" /> Your portfolio · deep analysis
        </h3>
        <div className="grid gap-4">
          {report.tickers.map((t) => (
            <TickerCard key={t.symbol} t={t} />
          ))}
        </div>
      </div>

      {/* News */}
      {report.news.length > 0 && (
        <div className="rounded-3xl border border-border/70 bg-card/40 p-6">
          <h3 className="flex items-center gap-2 font-display text-lg font-bold">
            <Newspaper className="size-5 text-primary" /> {report.bot === "crypto" ? "Worldwide crypto news" : "Market news"}
          </h3>
          <ul className="mt-3 divide-y divide-border/50">
            {report.news.map((n, i) => {
              const tone = n.impact === "Bullish" ? "text-emerald-400" : n.impact === "Bearish" ? "text-rose-400" : "text-muted-foreground";
              const inner = (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-medium">{n.title}</p>
                    <span className={cn("shrink-0 text-[0.62rem] font-bold uppercase", tone)}>{n.impact}</span>
                  </div>
                  {n.snippet && <p className="mt-1 text-xs leading-snug text-muted-foreground">{n.snippet}</p>}
                  <p className="mt-1 text-[0.62rem] text-muted-foreground/70">{n.source}</p>
                </>
              );
              return (
                <li key={i} className="py-3">
                  {n.url ? (
                    <a href={n.url} target="_blank" rel="noreferrer" className="block transition-opacity hover:opacity-80">
                      {inner}
                    </a>
                  ) : (
                    inner
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <p className="rounded-2xl border border-border/50 bg-background/30 p-4 text-center text-xs leading-relaxed text-muted-foreground">
        This was your one-time complimentary ZENITH report. Informational market intelligence only — not financial advice.
        Predictions are model-derived from real market data and are not guarantees. Powered by SuperGrok 4.3.
      </p>
    </div>
  );
}
