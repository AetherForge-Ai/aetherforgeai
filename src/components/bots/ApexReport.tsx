"use client";

/**
 * Shared renderer for a ApexReport object. Used both in the marketing demo
 * modals (isDemo reports) and in the subscriber dashboard (live reports).
 * Presentational only — it never fetches; the parent supplies the report.
 */

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { formatPercent } from "@/lib/portfolio";
import { formatMoney } from "@/lib/currency";
import type {
  ApexReport,
  TickerAnalysis,
  MomentumPoint,
  DirectRecommendation,
  PortfolioPathway,
} from "@/lib/apex";
import type { BriefingOutlookRow } from "@/lib/briefing";

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

function actionTone(action: DirectRecommendation["action"]): string {
  switch (action) {
    case "SELL":
      return "bg-rose-500/15 text-rose-400 border-rose-500/30";
    case "TRIM":
      return "bg-amber-500/15 text-amber-300 border-amber-500/30";
    case "HOLD":
      return "bg-sky-500/15 text-sky-300 border-sky-500/30";
    case "BUY":
      return "bg-teal-500/15 text-teal-300 border-teal-500/30";
    case "ACCUMULATE":
      return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
  }
}

/** Full multi-timeframe mover sweep — Top 10 per exchange, 3 windows. */
function MarketMoversSection({ report }: { report: ApexReport }) {
  if (!report.marketMovers?.length) return null;
  return (
    <div className="rounded-xl border border-border/60 bg-card/40 p-4">
      <div className="text-sm font-semibold">Full multi-timeframe mover sweep · Top 10</div>
      <p className="mb-3 text-xs text-muted-foreground">
        Biggest share-price gainers on each exchange over 24 hours, 7 days and the last month.
      </p>
      <div className="space-y-4">
        {report.marketMovers.map((g) => (
          <div key={g.market}>
            <div className="mb-1.5 text-xs font-semibold text-primary">{g.label}</div>
            <div className="grid gap-3 sm:grid-cols-3">
              {g.windows.map((w) => (
                <div key={w.window} className="rounded-lg border border-border/50 bg-background/40 p-2">
                  <div className="mb-1 text-[11px] font-medium text-muted-foreground">{w.window}</div>
                  <ul className="space-y-0.5">
                    {w.movers.map((m, i) => (
                      <li key={m.ticker} className="flex items-center justify-between text-[11px]">
                        <span className="truncate">
                          <span className="text-muted-foreground/60">{i + 1}.</span>{" "}
                          <span className="font-medium">{m.ticker}</span>
                        </span>
                        <span className={pctTone(m.changePct)}>{formatPercent(m.changePct)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Top-10 highest-conviction 7-day forward projections. */
function ProjectionLeadersSection({ report }: { report: ApexReport }) {
  if (!report.projectionLeaders?.length) return null;
  return (
    <div className="rounded-xl border border-border/60 bg-card/40 p-4">
      <div className="mb-2 text-sm font-semibold">Next 7 days · Top-10 projected movers</div>
      <div className="space-y-1">
        {report.projectionLeaders.map((r, i) => (
          <div key={r.ticker} className="flex items-center justify-between gap-2 text-sm">
            <span className="min-w-0 truncate text-muted-foreground">
              <span className="text-muted-foreground/60">{i + 1}.</span>{" "}
              <span className="font-medium text-foreground">{r.ticker}</span>
              <span className="text-muted-foreground/70"> · {r.market}</span>
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">{formatMoney(r.price, r.currency)}</span>
              <span className={`font-mono ${pctTone(r.projected7dPct)}`}>{formatPercent(r.projected7dPct)}</span>
              <span className="text-[11px] text-muted-foreground/70">{r.confidence}%</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** News broadcasts / press releases grouped by region. */
function RegionalNewsSection({ report }: { report: ApexReport }) {
  if (!report.regionalNews?.length) return null;
  return (
    <div className="rounded-xl border border-border/60 bg-card/40 p-4">
      <div className="mb-2 text-sm font-semibold">News &amp; press-release watch · NZ · AU · US</div>
      <div className="space-y-3">
        {report.regionalNews.map((g) => (
          <div key={g.region}>
            <div className="mb-1 text-xs font-semibold text-foreground">{g.region}</div>
            <ul className="space-y-1">
              {g.items.map((n, i) => (
                <li key={i} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-muted-foreground">
                    {n.headline}{" "}
                    <span className="text-muted-foreground/60">
                      · {n.source} · {n.time}
                    </span>
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
        ))}
      </div>
    </div>
  );
}

/** Direct, plain-English buy/sell/hold instructions. */
function DirectRecommendationsSection({ report }: { report: ApexReport }) {
  const recs = report.directRecommendations;
  if (!recs?.length) return null;
  const held = recs.filter((r) => r.held);
  const fresh = recs.filter((r) => !r.held);
  const urgent = held.some((r) => r.action === "SELL" || r.action === "TRIM");

  const Row = ({ r }: { r: DirectRecommendation }) => (
    <li className="rounded-lg border border-border/50 bg-background/40 p-2.5 text-sm">
      <div className="flex items-center gap-2">
        <Badge variant="outline" className={actionTone(r.action)}>
          {r.action}
        </Badge>
        <span className="font-semibold">{r.ticker}</span>
        <span className="text-xs text-muted-foreground">· {formatMoney(r.price, r.currency)}</span>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{r.detail}</p>
    </li>
  );

  return (
    <div className="rounded-xl border border-border/60 bg-card/40 p-4">
      <div className="text-sm font-semibold">Direct recommendations — build &amp; protect wealth</div>
      {urgent && (
        <div className="mt-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
          ⚠ Action required — one or more holdings are projected to weaken. Direct exit/trim guidance below.
        </div>
      )}
      {held.length > 0 && (
        <>
          <div className="mt-3 mb-1.5 text-xs font-semibold text-foreground">On your holdings</div>
          <ul className="grid gap-1.5">
            {held.map((r) => (
              <Row key={r.ticker} r={r} />
            ))}
          </ul>
        </>
      )}
      {fresh.length > 0 && (
        <>
          <div className="mt-3 mb-1.5 text-xs font-semibold text-emerald-400">
            New high-conviction opportunities (not yet held)
          </div>
          <ul className="grid gap-1.5">
            {fresh.map((r) => (
              <Row key={r.ticker} r={r} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/** Three forward pathways with steps + the recommended route. */
function PathwayPlanSection({ report }: { report: ApexReport }) {
  const plan = report.pathwayPlan;
  if (!plan?.pathways?.length) return null;

  const Card = ({ p }: { p: PortfolioPathway }) => (
    <div
      className={`rounded-xl border p-3 ${
        p.recommended ? "border-primary/50 bg-primary/5" : "border-border/60 bg-background/40"
      }`}
    >
      <div className="flex items-center justify-between text-[10px] uppercase tracking-wide text-muted-foreground">
        <span>
          {p.risk} · {p.probability}%
        </span>
        {p.recommended && <span className="font-bold text-primary">★ Recommended</span>}
      </div>
      <div className="mt-0.5 text-sm font-semibold">{p.name}</div>
      <div className={`text-base font-bold ${pctTone(p.targetPct)}`}>
        {formatPercent(p.targetPct)} <span className="text-[10px] font-normal text-muted-foreground">7-day target</span>
      </div>
      <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{p.summary}</p>
      <ol className="mt-2 list-decimal space-y-1 pl-4 text-[11px] leading-snug text-foreground/90">
        {p.steps.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ol>
    </div>
  );

  return (
    <div className="rounded-xl border border-border/60 bg-card/40 p-4">
      <div className="text-sm font-semibold">Three pathways forward — with step-by-step plan</div>
      <div className="mt-2 rounded-lg border border-primary/40 bg-primary/5 px-3 py-2">
        <div className="text-xs font-semibold text-primary">★ Recommended route: {plan.recommendedName}</div>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{plan.recommendationNote}</p>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-3">
        {plan.pathways.map((p) => (
          <Card key={p.name} p={p} />
        ))}
      </div>
    </div>
  );
}

function convTone(level: string): string {
  return level === "High"
    ? "text-emerald-600 border-emerald-500/40 bg-emerald-500/10"
    : level === "Moderate"
    ? "text-blue-600 border-blue-500/40 bg-blue-500/10"
    : level === "Speculative"
    ? "text-red-600 border-red-500/40 bg-red-500/10"
    : "text-muted-foreground border-border/60 bg-muted/40";
}

function OutlookRow({ r }: { r: BriefingOutlookRow }) {
  const { base, bull, bear } = r.outlook;
  const Cell = ({ label, lo, hi, prob, tone }: { label: string; lo: number; hi: number; prob: number; tone: string }) => (
    <td className="border-t border-border/50 px-2 py-1.5 text-center">
      <div className={`text-[11px] font-semibold ${tone}`}>
        {lo >= 0 ? "+" : ""}
        {lo}% … {hi >= 0 ? "+" : ""}
        {hi}%
      </div>
      <div className="text-[9px] text-muted-foreground">
        {label} · {prob}%
      </div>
    </td>
  );
  return (
    <tr>
      <td className="border-t border-border/50 px-2 py-1.5">
        <div className="text-xs font-semibold">{r.ticker}</div>
        <div className="text-[9px] text-muted-foreground">
          {r.regime} · <span className={convTone(r.conviction).split(" ")[0]}>{r.conviction}</span>
        </div>
      </td>
      <Cell label="Bear" lo={bear.lowPct} hi={bear.highPct} prob={bear.probability} tone="text-red-600" />
      <Cell label="Base" lo={base.lowPct} hi={base.highPct} prob={base.probability} tone="text-foreground" />
      <Cell label="Bull" lo={bull.lowPct} hi={bull.highPct} prob={bull.probability} tone="text-emerald-600" />
    </tr>
  );
}

function BriefingSection({ report }: { report: ApexReport }) {
  const b = report.briefing;
  if (!b) return null;
  const biasTone =
    b.overall.bias === "Constructive"
      ? "text-emerald-600 border-emerald-500/40 bg-emerald-500/10"
      : b.overall.bias === "Defensive"
      ? "text-red-600 border-red-500/40 bg-red-500/10"
      : "text-muted-foreground border-border/60 bg-muted/40";
  const sentTone =
    b.sentiment.label === "Bullish"
      ? "text-emerald-600 border-emerald-500/40 bg-emerald-500/10"
      : b.sentiment.label === "Bearish"
      ? "text-red-600 border-red-500/40 bg-red-500/10"
      : "text-muted-foreground border-border/60 bg-muted/40";

  return (
    <div className="rounded-xl border border-border/60 bg-card/40 p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">🎯 7-Day Intelligence Briefing</div>
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Probabilistic · evidence-based</span>
      </div>

      {/* Overall conviction chips */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        <Badge variant="outline" className={biasTone}>
          {b.overall.bias} bias
        </Badge>
        <Badge variant="outline" className={convTone(b.overall.level)}>
          {b.overall.level} conviction
        </Badge>
        <Badge variant="outline" className="border-border/60 text-muted-foreground">
          Net {b.overall.score}/100
        </Badge>
        <Badge variant="outline" className={sentTone}>
          Sentiment {b.sentiment.label} {b.sentiment.score}/100
        </Badge>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{b.overall.reason}</p>

      {/* Executive summary */}
      <div className="mt-3 rounded-lg border border-border/50 bg-background/40 p-3">
        <RichText text={b.executiveSummary} />
      </div>

      {/* Highlights */}
      {b.highlights.length ? (
        <div className="mt-3">
          <div className="text-xs font-semibold">Highlights</div>
          <ul className="mt-1 space-y-1 text-[11px] leading-snug">
            {b.highlights.map((h, i) => (
              <li key={i}>
                <RichText text={h} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {/* Key observations */}
        <div>
          <div className="text-xs font-semibold">Key observations</div>
          <ul className="mt-1 list-disc space-y-1 pl-4 text-[11px] leading-snug text-muted-foreground">
            {b.keyObservations.map((o, i) => (
              <li key={i}>{o}</li>
            ))}
          </ul>
        </div>
        {/* Risks */}
        <div>
          <div className="text-xs font-semibold">Risks — next 7 days</div>
          <ul className="mt-1 list-disc space-y-1 pl-4 text-[11px] leading-snug text-muted-foreground">
            {b.risks.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      </div>

      {/* Catalysts */}
      <div className="mt-3">
        <div className="text-xs font-semibold">Catalysts — next 7 days</div>
        {b.catalysts.length ? (
          <ul className="mt-1 space-y-1 text-[11px] leading-snug">
            {b.catalysts.map((e, i) => (
              <li key={i} className="flex flex-wrap items-baseline gap-x-2">
                <span className="min-w-[70px] text-muted-foreground">{e.dateLabel}</span>
                <span className="font-semibold">{e.title}</span>
                <span className={e.importance === "High" ? "text-red-600" : "text-blue-600"}>
                  · {e.region} · {e.importance}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-[11px] text-muted-foreground">No top-tier scheduled macro events in the next 7 days.</p>
        )}
      </div>

      {/* Probabilistic outlook table */}
      {b.outlook.length ? (
        <div className="mt-3 overflow-x-auto">
          <div className="text-xs font-semibold">Probabilistic 7-day outlook</div>
          <div className="mt-0.5 text-[10px] text-muted-foreground">
            Expected % move over the next 7 sessions — volatility-scaled ranges, not point targets.
          </div>
          <table className="mt-1 w-full border-collapse text-xs">
            <thead>
              <tr className="text-[9px] uppercase tracking-wide text-muted-foreground">
                <td className="px-2 py-1">Ticker</td>
                <td className="px-2 py-1 text-center">Bear</td>
                <td className="px-2 py-1 text-center">Base</td>
                <td className="px-2 py-1 text-center">Bull</td>
              </tr>
            </thead>
            <tbody>
              {b.outlook.map((r) => (
                <OutlookRow key={r.ticker} r={r} />
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <p className="mt-3 border-t border-border/50 pt-2 text-[9px] leading-relaxed text-muted-foreground">{b.disclaimer}</p>
    </div>
  );
}

export function ApexReportView({ report }: { report: ApexReport }) {
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge className="bg-primary/15 text-primary border-primary/30" variant="outline">
            ⚡ {report.engine || "Ultra Advanced ZENITH State"}
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
        <div>
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg border border-border/60 bg-card/40 p-3">
              <div className="text-[11px] text-muted-foreground">Total Worth · {report.portfolio.currency}</div>
              <div className="mt-0.5 text-lg font-semibold">
                {formatMoney(report.portfolio.value, report.portfolio.currency)}
              </div>
            </div>
            <div className="rounded-lg border border-border/60 bg-card/40 p-3">
              <div className="text-[11px] text-muted-foreground">Profit &amp; Loss</div>
              <div className={`mt-0.5 text-lg font-semibold ${pctTone(report.portfolio.pnl)}`}>
                {report.portfolio.pnl >= 0 ? "+" : ""}
                {formatMoney(report.portfolio.pnl, report.portfolio.currency)}
              </div>
            </div>
            <div className="rounded-lg border border-border/60 bg-card/40 p-3">
              <div className="text-[11px] text-muted-foreground">Return</div>
              <div className={`mt-0.5 text-lg font-semibold ${pctTone(report.portfolio.pnlPct)}`}>
                {formatPercent(report.portfolio.pnlPct)}
              </div>
            </div>
          </div>
          {report.portfolio.currency === "NZD" && (
            <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground/80">
              Total worth is aggregated in NZD — Australian (.AX) holdings display in AUD and US holdings in USD, then
              convert to NZD here.
            </p>
          )}
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

      {/* 7-day probabilistic intelligence briefing */}
      <BriefingSection report={report} />

      {/* Full multi-timeframe mover sweep (NZX / ASX / US · 3 windows) */}
      <MarketMoversSection report={report} />

      {/* Top-10 projected movers over the next 7 days */}
      <ProjectionLeadersSection report={report} />

      {/* Regional news / press-release watch (falls back to global synthesis) */}
      {report.regionalNews && report.regionalNews.length ? (
        <RegionalNewsSection report={report} />
      ) : (
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
      )}

      {/* Direct recommendations (sell/trim/buy/hold) */}
      <DirectRecommendationsSection report={report} />

      {/* Three forward pathways + recommended route */}
      <PathwayPlanSection report={report} />

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

export default ApexReportView;
