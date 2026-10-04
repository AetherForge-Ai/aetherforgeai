"use client";

/**
 * The Headmaster Console — Portfolio Planning and Strategies cockpit.
 * (File/component name kept as TotalumConsole for API/route stability.)
 *
 * Unifies the member's equities (Stox), crypto (Koins) and precious metals into
 * one NZD wealth system, then surfaces:
 *   • Portfolio Synthesis  — allocation ring, class breakdown, holdings, health
 *   • Scenario Simulator   — bull/base/bear pathways across 7/30/90d & 12mo
 *   • Stress Testing       — crypto winter, corrections, risk-off flights (heatmap)
 *   • Strategy Builder     — goal → target allocation + exact rebalancing plan
 *   • Chief Strategist     — conversational cross-asset AI
 *
 * Pro-gated: non-paying members see a polished upsell instead of the console.
 */

import * as React from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Sparkles,
  Crown,
  ShieldAlert,
  Layers,
  TrendingUp,
  Gauge,
  Bot,
  Download,
  Send,
  Lock,
  AlertTriangle,
  Compass,
  Loader2,
  X,
} from "lucide-react";
import type {
  TotalumSynthesis,
  StrategyBlueprint,
  GoalKey,
} from "@/lib/totalum-engine";
import { illustrativeActionLabel, modelViewSentence, sanitizeHeadmasterDisplayText, turnProgressLabel } from "@/lib/headmaster-trust";
import { useRecoverableTurn } from "@/lib/use-recoverable-turn";
import { cn } from "@/lib/utils";
import { headmasterDeskCopy } from "@/lib/entitlements";
import { BOT_HEADMASTER_AVATAR } from "../../../assets/files";

/* ------------------------------------------------------------------ *
 * Formatting helpers
 * ------------------------------------------------------------------ */

function nzd(v: number, compact = false): string {
  if (!isFinite(v)) v = 0;
  return `NZ$${new Intl.NumberFormat("en-NZ", {
    notation: compact ? "compact" : "standard",
    maximumFractionDigits: compact ? 1 : 0,
  }).format(v)}`;
}
function pct(v: number): string {
  return `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;
}
function gainClass(v: number): string {
  return v >= 0 ? "text-emerald-500" : "text-rose-500";
}

const GOALS: { key: GoalKey; name: string; risk: string }[] = [
  { key: "conservative_growth", name: "Conservative Growth", risk: "Low-Moderate" },
  { key: "balanced_growth", name: "Balanced Growth", risk: "Balanced" },
  { key: "income_growth", name: "Income + Growth", risk: "Moderate" },
  { key: "aggressive_growth", name: "Aggressive Growth", risk: "High Risk" },
  { key: "high_risk_high_reward", name: "High Risk High Reward", risk: "Very High Risk" },
  { key: "capital_preservation", name: "Capital Preservation", risk: "Low Risk" },
  { key: "preservation_crypto", name: "Preservation + Crypto", risk: "Low-Moderate" },
];

/* ------------------------------------------------------------------ *
 * Locked upsell (non-Pro members)
 * ------------------------------------------------------------------ */

function LockedUpsell() {
  const features = [
    { icon: Layers, title: "Portfolio Synthesis", body: "One unified NZD view across Stox, Koins & precious metals." },
    { icon: Compass, title: "Strategy Builder", body: "Goal-based model portfolios with exact rebalancing to target." },
    { icon: TrendingUp, title: "Scenario Simulator", body: "Bull / base / bear pathways over 7d, 30d, 90d and 12 months." },
    { icon: ShieldAlert, title: "Risk & Stress Testing", body: "Crypto winters, corrections and risk-off flights, quantified." },
    { icon: Bot, title: "Chief Strategist AI", body: "“How should I rebalance if BTC drops 20%?” — answered." },
    { icon: Download, title: "Intelligence Reports", body: "On-demand Total Portfolio Intelligence Report, ready to print." },
  ];
  return (
    <div className="mx-auto max-w-5xl">
      <div className="relative overflow-hidden rounded-3xl border border-primary/30 bg-gradient-to-br from-violet-500/15 via-primary/10 to-transparent p-8 md:p-12">
        <div className="pointer-events-none absolute -right-16 -top-16 size-64 rounded-full bg-primary/20 blur-3xl" />
        <Badge className="mb-4 border-primary/30 bg-primary/15 text-primary" variant="outline">
          <Crown className="mr-1 size-3.5" /> Pro Agent
        </Badge>
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
          Meet <span className="text-primary">The Headmaster</span> — Portfolio Planning and Strategies
        </h1>
        <p className="mt-4 max-w-2xl text-muted-foreground">
          The ultimate AI agent that orchestrates <strong>Stox</strong> and <strong>Koins</strong> into a unified
          wealth-building system. The Headmaster sees your entire book — stocks, crypto and precious metals — and engineers
          the allocation, strategy and risk controls to grow and protect it.
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="rounded-2xl border border-border/60 bg-card/50 p-4">
              <f.icon className="size-5 text-primary" />
              <p className="mt-2 text-sm font-semibold">{f.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>

        <div className="mt-8 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
          <Button asChild size="lg" className="font-semibold">
            <Link href="/pricing">
              <Lock className="mr-1.5 size-4" /> Unlock The Headmaster with Pro
            </Link>
          </Button>
          <p className="text-xs text-muted-foreground">
            Included free with any active paid AetherForge membership.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Small building blocks
 * ------------------------------------------------------------------ */

function Kpi({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <Card className="p-4">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 text-xl font-bold tracking-tight ${accent || ""}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </Card>
  );
}

function AllocationBar({ synthesis }: { synthesis: TotalumSynthesis }) {
  return (
    <div>
      <div className="flex h-4 w-full overflow-hidden rounded-full ring-1 ring-border/60">
        {synthesis.classAllocation.map((c) => (
          <div
            key={c.assetClass}
            style={{ width: `${c.weight}%`, background: c.color }}
            title={`${c.label} ${c.weight.toFixed(1)}%`}
          />
        ))}
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {synthesis.classAllocation.map((c) => (
          <div key={c.assetClass} className="flex items-center justify-between rounded-lg border border-border/50 bg-card/40 px-3 py-2">
            <span className="flex items-center gap-2 text-sm">
              <span className="size-2.5 rounded-full" style={{ background: c.color }} />
              {c.label}
            </span>
            <span className="text-sm font-semibold">{c.weight.toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Tab: Synthesis
 * ------------------------------------------------------------------ */

function SynthesisTab({ s }: { s: TotalumSynthesis }) {
  const modelView = modelViewSentence(s.expectedAnnualReturnPct, s.expectedAnnualVolPct);
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Facts from the current book: values, weights, concentration, and model return/volatility. This tab does not suggest trades.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Total Wealth" value={nzd(s.totalValueNZD)} sub="Unified · NZD base" />
        <Kpi label="Unrealised P/L" value={nzd(s.totalGainNZD)} sub={pct(s.totalGainPct)} accent={gainClass(s.totalGainNZD)} />
        <Kpi label="Diversification" value={`${s.diversificationScore}/100`} sub={s.concentrationLabel} />
        <Kpi label="Model view" value={modelView} sub="Annualised model" />
      </div>

      <Card className="p-5">
        <div className="mb-4 flex items-center gap-2">
          <Layers className="size-4 text-primary" />
          <h3 className="text-sm font-semibold">Asset-Class Allocation</h3>
          <Badge variant="outline" className="ml-auto text-[11px]">HHI {s.hhi}</Badge>
        </div>
        <AllocationBar synthesis={s} />
      </Card>

      <Card className="p-5">
        <h3 className="mb-3 text-sm font-semibold">Unified Holdings</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-2 py-2">Position</th>
                <th className="px-2 py-2">Class</th>
                <th className="px-2 py-2 text-right">Weight</th>
                <th className="px-2 py-2 text-right">Value</th>
                <th className="px-2 py-2 text-right">P/L</th>
              </tr>
            </thead>
            <tbody>
              {s.positions.map((p) => (
                <tr key={p.key} className="border-b border-border/40 last:border-0">
                  <td className="px-2 py-2">
                    <div className="font-medium">{p.label}</div>
                    {p.sublabel && <div className="text-xs text-muted-foreground">{p.sublabel}</div>}
                  </td>
                  <td className="px-2 py-2 capitalize text-muted-foreground">{p.assetClass}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{p.weight.toFixed(1)}%</td>
                  <td className="px-2 py-2 text-right tabular-nums">{nzd(p.valueNZD)}</td>
                  <td className={`px-2 py-2 text-right tabular-nums ${gainClass(p.gainNZD)}`}>{pct(p.gainPct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <div className="mb-3 flex items-center gap-2">
            <AlertTriangle className="size-4 text-amber-500" />
            <h3 className="text-sm font-semibold">Concentration Risks</h3>
          </div>
          {s.concentrationRisks.length ? (
            <ul className="space-y-2 text-sm">
              {s.concentrationRisks.map((r, i) => (
                <li key={i} className="flex gap-2">
                  <Badge variant={r.severity === "high" ? "destructive" : "secondary"} className="h-5 shrink-0 text-[10px]">
                    {r.weight.toFixed(0)}%
                  </Badge>
                  <span className="text-muted-foreground">{r.note}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No single-name or class over-concentration detected. Balanced book.</p>
          )}
        </Card>

        <Card className="p-5">
          <div className="mb-3 flex items-center gap-2">
            <Gauge className="size-4 text-primary" />
            <h3 className="text-sm font-semibold">Correlation Intelligence</h3>
          </div>
          <ul className="space-y-2 text-sm text-muted-foreground">
            {s.correlationNotes.map((n, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                <span>{n}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Tab: Scenarios
 * ------------------------------------------------------------------ */

function ScenariosTab({ s }: { s: TotalumSynthesis }) {
  const modelView = modelViewSentence(s.expectedAnnualReturnPct, s.expectedAnnualVolPct);
  const modelIsSilent = modelView === "The model has no view.";
  const maxAbs = Math.max(
    1,
    ...s.scenarios.flatMap((sc) => [Math.abs(sc.bullPct), Math.abs(sc.bearPct)])
  );
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {modelIsSilent
          ? modelView
          : `Pathway illustration only for your book. ${modelView}`}
      </p>
      {modelIsSilent ? null : <div className="grid gap-4 sm:grid-cols-2">
        {s.scenarios.map((sc) => (
          <Card key={sc.horizon} className="p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">{sc.horizon} Outlook</h3>
              <span className="text-xs text-muted-foreground">{sc.days} days</span>
            </div>
            <div className="mt-4 space-y-3">
              {[
                { label: "Bull", p: sc.bullPct, v: sc.bullValue, pnl: sc.bullPnl, color: "#10b981" },
                { label: "Base", p: sc.basePct, v: sc.baseValue, pnl: sc.basePnl, color: "#6366f1" },
                { label: "Bear", p: sc.bearPct, v: sc.bearValue, pnl: sc.bearPnl, color: "#f43f5e" },
              ].map((row) => (
                <div key={row.label}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium" style={{ color: row.color }}>{row.label}</span>
                    <span className="tabular-nums">
                      {nzd(row.v)} <span className={gainClass(row.pnl)}>({pct(row.p)})</span>
                    </span>
                  </div>
                  <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${Math.min(100, (Math.abs(row.p) / maxAbs) * 100)}%`, background: row.color }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Tab: Stress Testing (heatmap)
 * ------------------------------------------------------------------ */

function severityColor(sev: string): string {
  if (sev === "high") return "bg-rose-500/15 text-rose-500 ring-rose-500/30";
  if (sev === "medium") return "bg-amber-500/15 text-amber-500 ring-amber-500/30";
  return "bg-emerald-500/12 text-emerald-500 ring-emerald-500/25";
}

function StressTab({ s }: { s: TotalumSynthesis }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Shock illustration only. These cards apply named shocks to your live asset-class weights. They are not instructions.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {s.stressTests.map((t) => (
          <div key={t.key} className={`rounded-2xl p-4 ring-1 ${severityColor(t.severity)}`}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">{t.name}</h3>
              <span className="text-lg font-bold tabular-nums">{pct(t.impactPct)}</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{t.description}</p>
            <Separator className="my-3" />
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Impact</span>
              <span className={`font-semibold tabular-nums ${gainClass(t.impactNZD)}`}>{nzd(t.impactNZD)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Portfolio after</span>
              <span className="font-semibold tabular-nums text-foreground">{nzd(t.newValueNZD)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Tab: Strategy Builder
 * ------------------------------------------------------------------ */

function StrategyTab({ initialSynthesis }: { initialSynthesis: TotalumSynthesis }) {
  const [goal, setGoal] = React.useState<GoalKey>("balanced_growth");
  const [strategy, setStrategy] = React.useState<StrategyBlueprint | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [includeWatchlist, setIncludeWatchlist] = React.useState(false);
  const reportHref = `/api/totalum/report?goal=${goal}${includeWatchlist ? "&watchlist=1" : ""}&hm=2`;

  const build = React.useCallback(async (g: GoalKey) => {
    setLoading(true);
    setError(null);
    console.log("[TotalumConsole] Building strategy for goal:", g);
    const res = await api.post<{ synthesis: TotalumSynthesis; strategy: StrategyBlueprint }>("/api/totalum", { goal: g });
    if (res.ok && res.data?.strategy) {
      setStrategy(res.data.strategy);
    } else {
      setError(typeof res.error === "string" ? res.error : "Could not build the strategy. Please try again.");
    }
    setLoading(false);
  }, []);

  React.useEffect(() => {
    void build("balanced_growth");
  }, [build]);

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-md">
            <h3 className="text-sm font-semibold">Allocation skeleton</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Pick a goal. The Headmaster shows target weights, retained cash, and illustrative class amounts from one calculation. Not orders, and AetherForge does not trade for you.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={goal} onValueChange={(v) => setGoal(v as GoalKey)}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Choose a goal" />
              </SelectTrigger>
              <SelectContent>
                {GOALS.map((g) => (
                  <SelectItem key={g.key} value={g.key}>
                    {g.name} · {g.risk}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={() => build(goal)} disabled={loading}>
              {loading ? "Building…" : strategy ? "Rebuild strategy" : "Build strategy"}
            </Button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button asChild size="sm" variant="outline">
            <a href={reportHref} target="_blank" rel="noopener noreferrer">
              <Download className="mr-1.5 size-3.5" /> Intelligence report (HTML)
            </a>
          </Button>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Checkbox
              checked={includeWatchlist}
              onCheckedChange={(v) => setIncludeWatchlist(v === true)}
              aria-label="Include watchlist ideas"
            />
            Include watchlist ideas (not held, not instructions)
          </label>
        </div>
      </Card>

      {error && (
        <Card className="border-rose-500/30 bg-rose-500/5 p-4 text-sm text-rose-500">{error}</Card>
      )}

      {loading && <Skeleton className="h-72 w-full rounded-2xl" />}

      {strategy && !loading && (
        <>
          <Card className="border-emerald-500/30 bg-emerald-500/10 p-4">
            <div className="flex flex-wrap items-start gap-3">
              <span className="grid size-9 place-items-center rounded-xl bg-emerald-500/20 text-emerald-600">
                <Compass className="size-5" />
              </span>
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                  Strategy ready
                </p>
                <p className="text-xs text-muted-foreground">
                  The Headmaster has built an illustrative <span className="font-medium text-foreground">{strategy.name}</span> skeleton for your
                  current book. Review retained cash and class amounts below.
                </p>
                <div className="flex flex-wrap gap-2 pt-2">
                  <Button asChild size="sm" variant="default">
                    <a href={reportHref} target="_blank" rel="noopener noreferrer">
                      <Download className="mr-1.5 size-3.5" /> Download intelligence report
                    </a>
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const el = document.querySelector('[data-totalum-tab="strategist"]');
                      if (el instanceof HTMLElement) el.click();
                    }}
                  >
                    Ask the Chief Strategist
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => build(goal)} disabled={loading}>
                    Rebuild with this goal
                  </Button>
                </div>
              </div>
              <Badge variant="outline" className="border-emerald-500/40 text-emerald-700 dark:text-emerald-400">
                Ready
              </Badge>
            </div>
          </Card>
          <Card className="p-5">
            <div className="flex items-center gap-2">
              <Compass className="size-4 text-primary" />
              <h3 className="text-sm font-semibold">{strategy.name}</h3>
              <Badge variant="outline" className="ml-auto">{strategy.riskLabel}</Badge>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{sanitizeHeadmasterDisplayText(strategy.narrative, strategy.plan)}</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Kpi label="Model view" value={modelViewSentence(strategy.projectedReturnPct, strategy.projectedVolPct)} sub="Pathway, not a forecast" />
              <Kpi label="Retained cash" value={nzd(strategy.plan.retainedCashNZD)} sub={`${strategy.plan.targetCashPct}% of the book`} />
              <Kpi
                label="Cash reallocation"
                value={nzd(strategy.plan.cashToReallocateNZD)}
                sub={`Cash on book ${nzd(strategy.plan.cashOnBookNZD)}`}
              />
            </div>
            <p className="mt-3 text-xs text-muted-foreground">{sanitizeHeadmasterDisplayText(strategy.formula, strategy.plan)}</p>
          </Card>

          <Card className="p-5">
            <h3 className="mb-1 text-sm font-semibold">Allocation skeleton</h3>
            <p className="mb-3 text-xs text-muted-foreground">
              Amounts are the whole-dollar gap to the target weight. Increases equal reductions. Retained cash stays in the plan.
              Precious metals here are a target weight, not a holding and not a report you can run.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-2 py-2">Asset class</th>
                    <th className="px-2 py-2 text-right">Current</th>
                    <th className="px-2 py-2 text-right">Target</th>
                    <th className="px-2 py-2 text-right">Drift</th>
                    <th className="px-2 py-2 text-center">Scenario</th>
                    <th className="px-2 py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {strategy.rebalance.map((m) => (
                    <tr key={m.assetClass} className="border-b border-border/40 last:border-0">
                      <td className="px-2 py-2">
                        <span className="flex items-center gap-2">
                          <span className="size-2.5 rounded-full" style={{ background: m.color }} />
                          {m.label}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">{m.currentWeight.toFixed(1)}%</td>
                      <td className="px-2 py-2 text-right tabular-nums">{m.targetWeight}%</td>
                      <td className={`px-2 py-2 text-right tabular-nums ${m.driftPct > 0 ? "text-rose-500" : m.driftPct < 0 ? "text-emerald-500" : "text-muted-foreground"}`}>
                        {m.driftPct > 0 ? "+" : ""}{m.driftPct.toFixed(1)}%
                      </td>
                      <td className="px-2 py-2 text-center">
                        <Badge
                          variant={m.action === "unchanged" ? "secondary" : m.action === "increase" ? "default" : "outline"}
                          className="text-[10px]"
                        >
                          {illustrativeActionLabel(m.action)}
                        </Badge>
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">{m.action === "unchanged" ? "—" : nzd(m.amountNZD)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-5">
              <h3 className="mb-2 text-sm font-semibold text-emerald-500">Illustrative entry notes</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                {strategy.entryRules.map((r, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-emerald-500" />
                    <span>{sanitizeHeadmasterDisplayText(r, strategy.plan)}</span>
                  </li>
                ))}
              </ul>
            </Card>
            <Card className="p-5">
              <h3 className="mb-2 text-sm font-semibold text-rose-500">Illustrative exit &amp; risk notes</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                {strategy.exitRules.map((r, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-rose-500" />
                    <span>{sanitizeHeadmasterDisplayText(r, strategy.plan)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </>
      )}

      {initialSynthesis.isEmpty && (
        <p className="text-sm text-muted-foreground">
          Deposit cash in the Transaction Center and/or add equities, crypto or metals. Cash alone is enough to open an allocation skeleton.
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Tab: Chief Strategist (chat)
 * ------------------------------------------------------------------ */

interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}

const SUGGESTIONS = [
  "How should I rebalance if BTC drops 20%?",
  "Is my portfolio too concentrated?",
  "What's my biggest risk right now?",
  "How do I lower volatility without killing returns?",
];

function StrategistTab() {
  const [messages, setMessages] = React.useState<ChatMsg[]>([]);
  const turn = useRecoverableTurn();
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const messagesRef = React.useRef(messages);
  messagesRef.current = messages;

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, turn.working, turn.notice]);

  const send = React.useCallback(
    async (text: string) => {
      const msg = text.trim();
      if (!msg || turn.working) return;
      const history = messagesRef.current.slice(-10);
      setMessages((m) => [...m, { role: "user", content: msg }]);
      console.log("[TotalumConsole] Chief Strategist query:", msg);
      const outcome = await turn.run(msg, async (signal) => {
        const res = await api.post<{ reply: string; source: string }>(
          "/api/totalum/chat",
          { message: msg, history },
          { signal }
        );
        if (res.aborted) return { ok: false, error: "aborted" };
        if (res.ok && res.data?.reply) return { ok: true, text: res.data.reply };
        const err = typeof res.error === "string" ? res.error : "The strategist did not return an answer.";
        return { ok: false, error: err };
      });
      if (outcome.status === "ok") {
        setMessages((m) => [...m, { role: "assistant", content: outcome.text }]);
      } else if (outcome.status !== "ignored") {
        setMessages((m) => [...m, { role: "assistant", content: outcome.message }]);
      }
    },
    [turn]
  );

  return (
    <Card className="flex h-[560px] flex-col p-0">
      <div className="flex items-center gap-2 border-b border-border/60 px-5 py-3">
        <div className="grid size-8 place-items-center rounded-lg bg-primary/15">
          <Bot className="size-4 text-primary" />
        </div>
        <div>
          <p className="text-sm font-semibold">Chief Strategist</p>
          <p className="text-xs text-muted-foreground">Questions and answers about your book · not an order ticket</p>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
        {messages.length === 0 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Ask about the current book — allocation, risk, pathways, or the strategy skeleton. Answers are scenarios, not orders.
            </p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((q) => (
                <button
                  key={q}
                  type="button"
                  disabled={turn.working}
                  onClick={() => void send(q)}
                  className="rounded-full border border-border/60 bg-card/50 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-50"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm ${
                m.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "border border-border/60 bg-card/60 text-foreground"
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
        {turn.working && (
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-card/60 px-4 py-2.5 text-sm text-muted-foreground" role="status" aria-live="polite">
            <span className="inline-flex items-center gap-2">
              <Loader2 className="size-3.5 animate-spin text-primary" />
              {turnProgressLabel(turn.elapsedSec)}
            </span>
            <Button type="button" size="sm" variant="outline" onClick={turn.cancel}>
              <X className="mr-1 size-3.5" /> Cancel
            </Button>
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-border/60 p-3">
        {turn.notice && !turn.working && (
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200" role="alert">
            <span>{turn.notice}</span>
            {turn.retryPrompt && (
              <Button type="button" size="sm" variant="outline" onClick={() => void send(turn.retryPrompt!)}>
                Retry
              </Button>
            )}
          </div>
        )}
        <div className="flex items-end gap-2">
          <Textarea
            value={turn.draft}
            onChange={(e) => turn.setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(turn.draft);
              }
            }}
            placeholder="Or type a question…"
            className="min-h-[44px] max-h-32 resize-none"
            rows={1}
            aria-label="Ask the Chief Strategist"
          />
          <Button onClick={() => void send(turn.draft)} disabled={turn.working || !turn.draft.trim()} size="icon" className="size-11 shrink-0" aria-label="Send">
            <Send className="size-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ *
 * Root
 * ------------------------------------------------------------------ */

export function TotalumConsole({
  entitled,
  depth = "full",
  memberName,
  plan,
}: {
  entitled: boolean;
  depth?: "none" | "basic" | "full";
  memberName: string;
  plan?: string | null;
}) {
  const desk = headmasterDeskCopy(plan);
  const fullDesk = depth === "full";
  const [synthesis, setSynthesis] = React.useState<TotalumSynthesis | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!entitled) {
      setLoading(false);
      return;
    }
    let alive = true;
    (async () => {
      console.log("[TotalumConsole] Loading synthesis…");
      const res = await api.get<{ synthesis: TotalumSynthesis }>("/api/totalum");
      if (!alive) return;
      if (res.ok && res.data?.synthesis) {
        setSynthesis(res.data.synthesis);
      } else {
        setError(typeof res.error === "string" ? res.error : "Could not load your portfolio synthesis.");
      }
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [entitled]);

  if (!entitled) return <LockedUpsell />;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="relative hidden size-16 shrink-0 sm:block">
            {loading && (
              <span
                className="animate-avatar-glow pointer-events-none absolute inset-0 rounded-full bg-primary/40 blur-md"
                aria-hidden
              />
            )}
            <img
              src={BOT_HEADMASTER_AVATAR}
              alt="The Headmaster avatar"
              title="The Headmaster · Portfolio Planning and Strategies"
              className={cn(
                "relative size-16 rounded-2xl object-cover ring-1 ring-primary/25",
                loading && "animate-avatar-dance"
              )}
            />
          </div>
          <div>
          <div className="flex items-center gap-2">
            <Badge className="border-primary/30 bg-primary/15 text-primary" variant="outline">
              <Crown className="mr-1 size-3.5" /> The Headmaster · Portfolio Planning and Strategies
            </Badge>
            {synthesis && (
              <Badge variant="secondary" className="text-[11px]">
                <Sparkles className="mr-1 size-3" /> Spot {synthesis.metalsLive ? "live" : "est."}
              </Badge>
            )}
          </div>
          <h1 className="mt-3 text-2xl font-bold tracking-tight md:text-3xl">Portfolio Planning and Strategies</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            One planning desk across equities, crypto and precious metals — synthesis and strategy
            {fullDesk ? ", scenarios and risk" : ""}.
          </p>
          <p className="mt-2 max-w-2xl text-xs leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">{desk.summary}.</span> {desk.detail}
          </p>
          {fullDesk && (
          <div className="mt-3">
            <Button asChild size="sm" variant="outline">
              <a href="/api/totalum/report?goal=balanced_growth&hm=2" target="_blank" rel="noopener noreferrer">
                <Download className="mr-1.5 size-3.5" /> Total Portfolio Intelligence report
              </a>
            </Button>
          </div>
          )}
          </div>
        </div>
      </div>

      {loading && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-2xl" />
            ))}
          </div>
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      )}

      {error && !loading && (
        <Card className="border-rose-500/30 bg-rose-500/5 p-4 text-sm text-rose-500">{error}</Card>
      )}

      {synthesis && !loading && synthesis.isEmpty && (
        <Card className="border-dashed p-8 text-center">
          <Layers className="mx-auto size-8 text-muted-foreground" />
          <h3 className="mt-3 text-lg font-semibold">Your unified book is empty</h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Deposit cash in the Transaction Center, or add equities in Stox, coins in Koins, and gold/silver in Precious
            Metals. Cash alone is enough to open an allocation skeleton for the current book.
          </p>
          <Button asChild className="mt-4">
            <Link href="/dashboard">Go to your dashboard</Link>
          </Button>
        </Card>
      )}

      {synthesis && !loading && !synthesis.isEmpty && (
        <Tabs defaultValue="synthesis">
          <TabsList className={fullDesk ? "grid w-full grid-cols-2 sm:w-auto sm:grid-cols-5" : "grid w-full grid-cols-3 sm:w-auto"}>
            <TabsTrigger value="synthesis">Synthesis</TabsTrigger>
            <TabsTrigger value="scenarios">Scenarios</TabsTrigger>
            {fullDesk && <TabsTrigger value="stress">Stress</TabsTrigger>}
            <TabsTrigger value="strategy">Strategy</TabsTrigger>
            {fullDesk && <TabsTrigger data-totalum-tab="strategist" value="strategist">Strategist</TabsTrigger>}
          </TabsList>
          <TabsContent value="synthesis" className="mt-6">
            <SynthesisTab s={synthesis} />
          </TabsContent>
          <TabsContent value="scenarios" className="mt-6">
            <ScenariosTab s={synthesis} />
          </TabsContent>
          {fullDesk && (
          <TabsContent value="stress" className="mt-6">
            <StressTab s={synthesis} />
          </TabsContent>
          )}
          <TabsContent value="strategy" className="mt-6">
            <StrategyTab initialSynthesis={synthesis} />
          </TabsContent>
          {fullDesk && (
          <TabsContent value="strategist" className="mt-6">
            <StrategistTab />
          </TabsContent>
          )}
        </Tabs>
      )}
    </div>
  );
}

export default TotalumConsole;
