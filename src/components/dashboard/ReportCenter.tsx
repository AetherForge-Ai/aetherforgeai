"use client";

/**
 * Report Center — the master intelligence desk at the foot of the dashboard.
 *
 *  1. "Run full SuperGrok 4.3 ULTRA ADVANCED report" buttons per unlocked bot
 *     (Stox + Koins), plus The Headmaster (Portfolio Planning and Strategies) that unifies
 *     stocks, crypto & metals into one strategy.
 *     Running calls POST /api/reports, which emails the report + PDF, persists it
 *     and returns it for immediate inline display.
 *  2. A history list of past reports, each downloadable as a PDF.
 *
 * NOTE: adding holdings now lives entirely in the Transaction Center (buy/sell),
 * so the old inline "Add ticker" form has been removed from here.
 */

import * as React from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ApexReportView } from "@/components/bots/ApexReport";
import type { ApexReport, BotKind } from "@/lib/apex";
import { BOT_STOX_AVATAR, BOT_KOINS_AVATAR, BOT_HEADMASTER_AVATAR } from "../../../assets/files";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { checkReportQuota, formatDuration, reportCadence } from "@/lib/entitlements";
import { Loader2, Lock, Play, FileDown, Mail, FileText, Sparkles, Clock, Zap, ArrowRight } from "lucide-react";

type BotAccess = "stock" | "crypto" | "both" | "none";

interface PastReport {
  _id: string;
  title: string;
  bot: BotKind;
  marketLabel: string;
  executiveSummary: string;
  emailed: string;
  aiEnhanced: boolean;
  trigger?: string;
  generatedAt: string;
  pdfUrl: string | null;
}

interface BotQuota {
  allowed: boolean;
  waitMs: number;
  nextAllowedAt: string | null;
  lastReportAt: string | null;
  cadenceLabel: string;
  cadenceUnit: "day" | "week";
}

interface ReportsResponse {
  reports: PastReport[];
  // Independent per report-system allowances — Stox and Koins are tracked
  // separately (one full report each per plan window).
  quota: { stock: BotQuota; crypto: BotQuota };
}

const DEFS: { kind: BotKind; name: string; subtitle: string; mascot: string; accent: string; market: string }[] = [
  {
    kind: "stock",
    name: "Stox",
    subtitle: "Stock Market Intelligence Monitor",
    mascot: BOT_STOX_AVATAR,
    accent: "from-emerald-500/15 to-transparent",
    market: "NZX · ASX · NASDAQ · Dow Jones",
  },
  {
    kind: "crypto",
    name: "Koins",
    subtitle: "Crypto Market Intelligence Monitor",
    mascot: BOT_KOINS_AVATAR,
    accent: "from-amber-500/15 to-transparent",
    market: "Complete cryptocurrency market",
  },
];

function fmtDate(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-NZ", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export function ReportCenter({
  botAccess,
  plan,
  scope,
  counts,
  tickerLimit,
  preview = false,
}: {
  botAccess: BotAccess;
  plan?: string | null;
  scope: "total" | "perBot";
  counts: { stock: number; crypto: number; total: number };
  tickerLimit?: number | null;
  /** Retained for API compatibility with the dashboard; holdings are edited in the Transaction Center now. */
  onHoldingsChanged?: () => void;
  /** Guest preview — read-only, no network calls. */
  preview?: boolean;
}) {
  const [running, setRunning] = React.useState<BotKind | null>(null);
  const [report, setReport] = React.useState<ApexReport | null>(null);
  const [lastPdfUrl, setLastPdfUrl] = React.useState<string | null>(null);
  const [lastAiEnhanced, setLastAiEnhanced] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [history, setHistory] = React.useState<PastReport[]>([]);
  // Independent per-bot last-report timestamps → independent countdowns.
  const [lastReportAt, setLastReportAt] = React.useState<{ stock: string | null; crypto: string | null }>({
    stock: null,
    crypto: null,
  });
  // Live clock so the "next report unlocks in…" countdown ticks down on screen.
  const [now, setNow] = React.useState<number>(() => Date.now());

  const canRun = (kind: BotKind) => botAccess === "both" || botAccess === kind;

  // Report cadence — recomputed live against `now` so the countdowns tick. Each
  // bot has its OWN quota so Stox and Koins unlock independently.
  const cadence = reportCadence(plan);
  const quotaFor = (kind: BotKind) => checkReportQuota(plan, lastReportAt[kind], now);
  const anyLocked = (["stock", "crypto"] as BotKind[]).some((k) => !quotaFor(k).allowed);

  const loadHistory = React.useCallback(async () => {
    if (preview) return; // guest preview: no live report history fetch
    const res = await api.get<ReportsResponse>("/api/reports");
    if (res.ok && res.data) {
      setHistory(res.data.reports || []);
      setLastReportAt({
        stock: res.data.quota?.stock?.lastReportAt ?? null,
        crypto: res.data.quota?.crypto?.lastReportAt ?? null,
      });
    } else {
      console.error("[ReportCenter] Failed to load report history:", res.error);
    }
  }, [preview]);

  React.useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // Tick the countdown once a minute (only while at least one report is locked).
  React.useEffect(() => {
    if (!anyLocked) return;
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, [anyLocked]);

  async function runReport(kind: BotKind) {
    if (!canRun(kind)) {
      toast.error("Your plan does not include this monitor.");
      return;
    }
    const kindQuota = quotaFor(kind);
    if (!kindQuota.allowed) {
      const label = kind === "crypto" ? "Koins" : "Stox";
      toast.error(`You've used your ${label} ${cadence.label}. Next ${label} report unlocks in ${formatDuration(kindQuota.waitMs)}.`);
      return;
    }
    setRunning(kind);
    console.log(`[ReportCenter] Running ${kind} report`);
    const res = await api.post<{
      report: ApexReport;
      pdfUrl: string | null;
      emailed: boolean;
      aiEnhanced: boolean;
      monitored: number;
      nextAllowedAt: string | null;
    }>("/api/reports", { bot: kind });
    setRunning(null);

    if (!res.ok || !res.data?.report) {
      // Cadence limit → friendly countdown message; other errors → raw message.
      const msg = typeof res.error === "string" ? res.error : res.error?.message || "Failed to generate the report.";
      console.error("[ReportCenter] run failed:", res.error);
      toast.error(msg);
      // Refresh so the countdown reflects the server's authoritative state.
      loadHistory();
      return;
    }
    setReport(res.data.report);
    setLastPdfUrl(res.data.pdfUrl);
    setLastAiEnhanced(!!res.data.aiEnhanced);
    setOpen(true);
    // Start THIS bot's countdown immediately from this run — the other bot's
    // allowance is untouched.
    setLastReportAt((prev) => ({ ...prev, [kind]: new Date().toISOString() }));
    setNow(Date.now());
    toast.success(
      res.data.emailed
        ? `Report ready — emailed to you and saved below.`
        : `Report ready and saved below (email delivery is pending).`
    );
    loadHistory();
  }

  return (
    <section className="rounded-3xl border border-border/70 bg-gradient-to-br from-primary/8 to-card/50 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-display text-lg font-bold">Report Center</h2>
            <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
              <Sparkles className="mr-1 size-3" /> Ultra Advanced ZENITH State
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Run the full SuperGrok 4.3 ULTRA ADVANCED report for Stox, Koins or The Headmaster —
            delivered to your inbox and here.
          </p>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          <div className="font-display text-lg font-bold text-foreground">
            {counts.total}
            {tickerLimit ? <span className="text-sm text-muted-foreground"> / {tickerLimit}{scope === "perBot" ? " per bot" : ""}</span> : null}
          </div>
          tickers monitored
        </div>
      </div>

      {/* Report cadence status — one independent allowance per report system */}
      <div
        className={cn(
          "mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4",
          anyLocked
            ? "border-[var(--gold)]/40 bg-[var(--gold)]/10"
            : "border-emerald-500/30 bg-emerald-500/10"
        )}
      >
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "flex size-9 items-center justify-center rounded-xl",
              anyLocked ? "bg-[var(--gold)]/20 text-[var(--gold)]" : "bg-emerald-500/20 text-emerald-600"
            )}
          >
            {anyLocked ? <Clock className="size-5" /> : <Zap className="size-5" />}
          </span>
          <div>
            <p className="text-sm font-semibold">
              One full <span className="text-foreground">Stox</span> report{" "}
              <span className="text-muted-foreground">and</span> one full{" "}
              <span className="text-foreground">Koins</span> report per {cadence.unit}
            </p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
              {(["stock", "crypto"] as BotKind[]).map((k) => {
                const q = quotaFor(k);
                const label = k === "crypto" ? "Koins" : "Stox";
                return (
                  <span key={k} className="inline-flex items-center gap-1">
                    <span className="font-medium text-foreground">{label}:</span>
                    {q.allowed ? (
                      <span className="text-emerald-600">ready to run</span>
                    ) : (
                      <span className="text-[var(--gold)]">unlocks in {formatDuration(q.waitMs)}</span>
                    )}
                  </span>
                );
              })}
              <span className="text-muted-foreground/70">· tracked independently</span>
            </p>
          </div>
        </div>
        {anyLocked && (plan === "free" || plan === "weekly") && (
          <Button asChild size="sm" variant="outline" className="border-[var(--gold)]/40">
            <Link href="/pricing">
              <Zap className="mr-1 size-4" /> Upgrade
            </Link>
          </Button>
        )}
      </div>

      {/* Run buttons */}
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {DEFS.map((b) => {
          const unlocked = canRun(b.kind);
          const busy = running === b.kind;
          const botQuota = quotaFor(b.kind);
          const botLocked = !botQuota.allowed;
          return (
            <div
              key={b.kind}
              className={`relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br ${b.accent} p-5`}
            >
              <div className="flex items-start gap-4">
                <div className="relative h-14 w-14 shrink-0">
                  {/* Grooving glow that pulses under the avatar while it dances */}
                  {busy && (
                    <span
                      className="animate-avatar-glow pointer-events-none absolute inset-0 rounded-full bg-primary/40 blur-md"
                      aria-hidden
                    />
                  )}
                  <img
                    src={b.mascot}
                    alt={`${b.name} avatar`}
                    className={cn(
                      "relative h-14 w-14 rounded-xl object-cover ring-1 ring-border/60",
                      busy && "animate-avatar-dance"
                    )}
                  />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold leading-tight">
                    {b.name} <span className="font-normal text-muted-foreground">· {b.subtitle}</span>
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">{b.market}</p>
                </div>
              </div>
              <div className="mt-4">
                {!unlocked ? (
                  <Button asChild variant="outline" className="w-full">
                    <Link href="/pricing">
                      <Lock className="mr-1 size-4" /> Unlock this monitor
                    </Link>
                  </Button>
                ) : botLocked ? (
                  <Button variant="outline" className="w-full" disabled>
                    <Clock className="mr-1 size-4" /> Next {b.name} report in {formatDuration(botQuota.waitMs)}
                  </Button>
                ) : (
                  <Button className="w-full" onClick={() => runReport(b.kind)} disabled={busy || running !== null}>
                    {busy ? (
                      <>
                        <Loader2 className="mr-1 size-4 animate-spin" /> Compiling report…
                      </>
                    ) : (
                      <>
                        <Play className="mr-1 size-4" /> Run full {b.name} report
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* The Headmaster · Portfolio Planning and Strategies — unifies Stox + Koins + metals */}
      <Link
        href="/headmaster"
        className="group relative mt-4 flex flex-col gap-4 overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-violet-500/12 via-primary/10 to-transparent p-5 transition-all hover:border-primary/50 hover:shadow-glow sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full bg-primary/15 blur-3xl" />
        <div className="relative flex items-start gap-4">
          <img
            src={BOT_HEADMASTER_AVATAR}
            alt="The Headmaster avatar"
            className="size-11 shrink-0 rounded-xl object-cover ring-1 ring-primary/25"
          />
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold">The Headmaster · Portfolio Planning and Strategies</h3>
              <span className="rounded-md bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                Pro
              </span>
            </div>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              Combines Stox &amp; Koins with your precious metals into one strategy — allocation, rebalancing,
              scenarios, stress tests and a Chief Strategist AI.
            </p>
          </div>
        </div>
        <span className="relative inline-flex items-center gap-1.5 self-start rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground sm:self-auto">
          Open The Headmaster <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
        </span>
      </Link>

      {/* Report history */}
      <div className="mt-6">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <FileText className="size-4 text-primary" /> Your reports
        </div>
        {history.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border/60 p-4 text-sm text-muted-foreground">
            No reports yet — add holdings in the Transaction Center above, then run your first report.
          </p>
        ) : (
          <ul className="divide-y divide-border/50 overflow-hidden rounded-xl border border-border/60">
            {history.map((r) => (
              <li key={r._id} className="flex flex-wrap items-center justify-between gap-3 bg-card/40 px-4 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{r.title}</span>
                    {r.aiEnhanced && (
                      <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
                        <Sparkles className="mr-1 size-3" /> Grok 4.3
                      </Badge>
                    )}
                    {r.emailed === "yes" && (
                      <Badge variant="outline" className="border-emerald-500/30 text-emerald-600">
                        <Mail className="mr-1 size-3" /> Emailed
                      </Badge>
                    )}
                    {r.trigger === "scheduled" && (
                      <Badge variant="outline" className="border-violet-400/30 text-violet-700">
                        <Clock className="mr-1 size-3" /> 9am briefing
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{fmtDate(r.generatedAt)}</p>
                </div>
                {r.pdfUrl ? (
                  <Button asChild size="sm" variant="outline">
                    <a href={r.pdfUrl} target="_blank" rel="noopener noreferrer">
                      <FileDown className="mr-1 size-4" /> PDF
                    </a>
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground">PDF unavailable</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Inline report modal */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <div className="flex flex-wrap items-center justify-between gap-2 pr-6">
              <div>
                <div className="flex items-center gap-2">
                  <DialogTitle>{report?.title ?? "ZENITH report"}</DialogTitle>
                  {lastAiEnhanced && (
                    <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
                      <Sparkles className="mr-1 size-3" /> Grok 4.3 enhanced
                    </Badge>
                  )}
                </div>
                <DialogDescription>
                  Live intelligence built from your holdings — a copy has been emailed to you.
                </DialogDescription>
              </div>
              {lastPdfUrl && (
                <Button asChild size="sm" variant="outline">
                  <a href={lastPdfUrl} target="_blank" rel="noopener noreferrer">
                    <FileDown className="mr-1 size-4" /> Download PDF
                  </a>
                </Button>
              )}
            </div>
          </DialogHeader>
          {report && <ApexReportView report={report} />}
        </DialogContent>
      </Dialog>
    </section>
  );
}

export default ReportCenter;
