"use client";

/**
 * Shared renderer for a ZenithReport object. Used both in the marketing demo
 * modals (isDemo reports) and in the subscriber dashboard (live reports).
 * Presentational only — it never fetches; the parent supplies the report.
 */

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatPercent } from "@/lib/portfolio";
import type { ZenithReport, TickerAnalysis, MomentumPoint } from "@/lib/zenith";

function signalTone(signal: TickerAnalysis["signal"]): string {
  switch (signal) {
    case "Strong Buy":
      return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
    case "Accumulate":
      return "bg-teal-500/15 text-teal-300 border-teal-500/30";
    case "Hold":
      return "bg-sky-500/15 text-sky-300 border-sky-500/30";
    case "Watch":
      return "bg-amber-500/15 text-amber-300 border-amber-500/30";
    case "Reduce":
      return "bg-rose-500/15 text-rose-300 border-rose-500/30";
  }
}

function pctTone(v: number): string {
  return v > 0 ? "text-emerald-400" : v < 0 ? "text-rose-400" : "text-muted-foreground";
}

/** Compact 12-month momentum / continuation line chart (SVG, no deps). */
function MomentumChart({ series, positive }: { series: MomentumPoint[]; positive: boolean }) {
  const W = 560;
  const H = 150;
  const P = 8;
  const values = series.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (i: number) => P + (i / (series.length - 1)) * (W - P * 2);
  const y = (v: number) => H - P - ((v - min) / span) * (H - P * 2);
  const line = series.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const area = `${line} L${x(series.length - 1).toFixed(1)},${H - P} L${x(0).toFixed(1)},${H - P} Z`;
  const stroke = positive ? "#34d399" : "#fb7185";
  const gid = `grad-${positive ? "up" : "dn"}`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" preserveAspectRatio="none" role="img" aria-label="12-month momentum">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.28" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {series.map((p, i) =>
        i % 2 === 0 ? (
          <text key={i} x={x(i)} y={H - 1} fontSize="8" fill="currentColor" opacity="0.5" textAnchor="middle">
            {p.label}
          </text>
        ) : null
      )}
    </svg>
  );
}

function TickerCard({ t }: { t: TickerAnalysis }) {
  const priceDp = t.price < 5 ? 4 : 2;
  return (
    <div className="rounded-xl border border-border/60 bg-card/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-semibold tracking-tight">{t.ticker}</span>
            <Badge variant="outline" className={signalTone(t.signal)}>
              {t.signal}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">{t.name}</p>
        </div>
        <div className="text-right">
          <div className="font-mono text-sm">${t.price.toFixed(priceDp)}</div>
          <div className={`text-xs ${pctTone(t.changePct)}`}>{formatPercent(t.changePct)} today</div>
        </div>
      </div>

      {/* 12-month continuation graph */}
      <div className="mt-3">
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>12-month continuation / momentum</span>
          <span className={pctTone(t.momentum12moPct)}>{formatPercent(t.momentum12moPct)} 12m</span>
        </div>
        <div className="mt-1 text-muted-foreground">
          <MomentumChart series={t.momentum} positive={t.momentum12moPct >= 0} />
        </div>
      </div>

      {/* 7-day short-term predictions */}
      <div className="mt-3">
        <div className="text-[11px] text-muted-foreground mb-1">7-day short-term projection</div>
        <div className="grid grid-cols-7 gap-1">
          {t.shortTerm.map((d) => (
            <div key={d.day} className="rounded-md border border-border/50 bg-background/40 px-1 py-1.5 text-center">
              <div className="text-[9px] text-muted-foreground">D{d.day.replace("Day ", "")}</div>
              <div className={`text-[10px] font-mono ${pctTone(d.movePct)}`}>
                {d.direction === "up" ? "▲" : d.direction === "down" ? "▼" : "—"}
              </div>
              <div className={`text-[9px] font-mono ${pctTone(d.movePct)}`}>{d.movePct > 0 ? "+" : ""}{d.movePct}%</div>
            </div>
          ))}
        </div>
      </div>

      {/* 3 forward pathways */}
      <div className="mt-3 grid gap-1.5 sm:grid-cols-3">
        {t.pathways.map((p) => (
          <div key={p.name} className="rounded-md border border-border/50 bg-background/40 p-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{p.name}</span>
              <span className="text-[10px] text-muted-foreground">{p.probability}%</span>
            </div>
            <div className={`text-sm font-semibold ${pctTone(p.targetPct)}`}>
              {p.targetPct > 0 ? "+" : ""}
              {p.targetPct}%
            </div>
            <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground line-clamp-3">{p.narrative}</p>
          </div>
        ))}
      </div>

      <p className="mt-3 text-xs leading-relaxed text-muted-foreground/90">{t.note}</p>
    </div>
  );
}

/** Render small inline markdown-ish bold + italics from the summary string. */
function RichText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|_[^_]+_)/g).filter(Boolean);
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith("**") && p.endsWith("**")) return <strong key={i} className="text-foreground">{p.slice(2, -2)}</strong>;
        if (p.startsWith("_") && p.endsWith("_")) return <em key={i} className="text-muted-foreground/80">{p.slice(1, -1)}</em>;
        return <React.Fragment key={i}>{p}</React.Fragment>;
      })}
    </>
  );
}

export function ZenithReportView({ report }: { report: ZenithReport }) {
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge className="bg-primary/15 text-primary border-primary/30" variant="outline">
            ⚡ Zenith State
          </Badge>
          <Badge variant="outline" className="border-border/60 text-muted-foreground">
            {report.marketLabel}
          </Badge>
        </div>
        <Badge
          variant="outline"
          className={report.isDemo ? "border-amber-500/40 text-amber-300 bg-amber-500/10" : "border-emerald-500/40 text-emerald-300 bg-emerald-500/10"}
        >
          {report.generatedLabel}
        </Badge>
      </div>

      {/* Portfolio snapshot (live only) */}
      {report.portfolio && (
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg border border-border/60 bg-card/40 p-3">
            <div className="text-[11px] text-muted-foreground">Portfolio Value</div>
            <div className="mt-0.5 text-lg font-semibold">{formatCurrency(report.portfolio.value)}</div>
          </div>
          <div className="rounded-lg border border-border/60 bg-card/40 p-3">
            <div className="text-[11px] text-muted-foreground">Profit &amp; Loss</div>
            <div className={`mt-0.5 text-lg font-semibold ${pctTone(report.portfolio.pnl)}`}>
              {report.portfolio.pnl >= 0 ? "+" : ""}
              {formatCurrency(report.portfolio.pnl)}
            </div>
          </div>
          <div className="rounded-lg border border-border/60 bg-card/40 p-3">
            <div className="text-[11px] text-muted-foreground">Return</div>
            <div className={`mt-0.5 text-lg font-semibold ${pctTone(report.portfolio.pnlPct)}`}>
              {formatPercent(report.portfolio.pnlPct)}
            </div>
          </div>
        </div>
      )}

      {/* Executive summary */}
      <div className="rounded-xl border border-border/60 bg-gradient-to-br from-primary/5 to-transparent p-4">
        <p className="text-sm leading-relaxed text-muted-foreground">
          <RichText text={report.executiveSummary} />
        </p>
      </div>

      {/* Top gainers + observations */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-border/60 bg-card/40 p-4">
          <div className="text-sm font-semibold mb-2">Top gainers identified</div>
          {report.topGainers.length ? (
            <ul className="space-y-1.5">
              {report.topGainers.map((g) => (
                <li key={g.ticker} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    <span className="font-medium text-foreground">{g.ticker}</span> · {g.name}
                  </span>
                  <span className="text-emerald-400 font-mono">+{g.changePct}%</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Consolidating tape — no standout gainers this session.</p>
          )}
        </div>
        <div className="rounded-xl border border-border/60 bg-card/40 p-4">
          <div className="text-sm font-semibold mb-2">Data-backed observations</div>
          <ul className="space-y-1.5">
            {report.keyObservations.map((o, i) => (
              <li key={i} className="flex gap-2 text-sm text-muted-foreground">
                <span className="text-primary">›</span>
                <span>{o}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* News synthesis */}
      <div className="rounded-xl border border-border/60 bg-card/40 p-4">
        <div className="text-sm font-semibold mb-2">Global news synthesis</div>
        <ul className="space-y-1.5">
          {report.newsSynthesis.map((n, i) => (
            <li key={i} className="flex items-center justify-between gap-3 text-sm">
              <span className="text-muted-foreground">
                {n.headline} <span className="text-muted-foreground/60">· {n.source}</span>
              </span>
              <Badge
                variant="outline"
                className={
                  n.impact === "Bullish"
                    ? "border-emerald-500/30 text-emerald-400"
                    : n.impact === "Bearish"
                      ? "border-rose-500/30 text-rose-400"
                      : "border-border/60 text-muted-foreground"
                }
              >
                {n.impact}
              </Badge>
            </li>
          ))}
        </ul>
      </div>

      {/* Per-ticker deep analysis */}
      <div>
        <div className="text-sm font-semibold mb-2">
          Per-{report.bot === "crypto" ? "asset" : "ticker"} intelligence ({report.tickers.length})
        </div>
        <div className="grid gap-3">
          {report.tickers.map((t) => (
            <TickerCard key={t.ticker} t={t} />
          ))}
        </div>
      </div>

      <p className="text-[11px] leading-relaxed text-muted-foreground/70 border-t border-border/50 pt-3">
        AetherForge AI delivers informational market intelligence only. Nothing here is personalised financial advice, a
        recommendation, or an offer to buy or sell any security or digital asset. Always do your own research.
      </p>
    </div>
  );
}

export default ZenithReportView;
