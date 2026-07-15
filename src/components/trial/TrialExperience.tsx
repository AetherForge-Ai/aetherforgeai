"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Bitcoin,
  LineChart,
  Plus,
  Trash2,
  Zap,
  Loader2,
  ShieldCheck,
  Gauge,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import { TrialReportView } from "@/components/trial/TrialReportView";
import type { BotKind, TrialReport } from "@/lib/trial-types";

type AssetClass = BotKind;

interface TickerRow {
  id: string;
  symbol: string;
  shares: string;
  avgPrice: string;
}

interface RunResponse {
  report: TrialReport;
  pdfUrl: string | null;
  emailed: boolean;
  aiEnhanced: boolean;
  email: string;
}

const CRYPTO_SUGGEST = ["BTC", "ETH", "SOL", "XRP", "ADA", "DOGE", "AVAX", "LINK"];
const STOCK_SUGGEST = ["AIR.NZ", "FPH.NZ", "SPK.NZ", "MEL.NZ", "BHP.AX", "CBA.AX", "CSL.AX", "FMG.AX"];

const CRYPTO_STAGES = [
  "Connecting to the top-100 crypto market feed…",
  "Sweeping 24h / 7d / 30d performance across all 100 majors…",
  "Pulling 12-month price history for your assets…",
  "Scanning worldwide crypto news wires…",
  "Running ZENITH momentum & mean-reversion models…",
  "Grok 4.3 composing your ULTRA executive briefing…",
  "Rendering PDF & dispatching to your inbox…",
];
const STOCK_STAGES = [
  "Connecting to the NZX + ASX market feed…",
  "Sweeping the entire NZX + ASX universe…",
  "Pulling 12-month price history for your tickers…",
  "Computing RSI / MACD / momentum signals…",
  "Running ZENITH forward-projection models…",
  "Grok 4.3 composing your ULTRA executive briefing…",
  "Rendering PDF & dispatching to your inbox…",
];

let ROW_SEQ = 0;
function newRow(): TickerRow {
  ROW_SEQ += 1;
  return { id: `r${ROW_SEQ}`, symbol: "", shares: "", avgPrice: "" };
}

export function TrialExperience({ userName }: { userName?: string }) {
  const [asset, setAsset] = useState<AssetClass>("crypto");
  const [rows, setRows] = useState<TickerRow[]>([newRow()]);
  const [running, setRunning] = useState(false);
  const [stageIdx, setStageIdx] = useState(0);
  const [result, setResult] = useState<RunResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stages = asset === "crypto" ? CRYPTO_STAGES : STOCK_STAGES;
  const suggestions = asset === "crypto" ? CRYPTO_SUGGEST : STOCK_SUGGEST;

  const filledSymbols = useMemo(
    () => rows.map((r) => r.symbol.trim().toUpperCase()).filter(Boolean),
    [rows]
  );
  const canRun = filledSymbols.length >= 1 && !running;

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  function updateRow(id: string, patch: Partial<TickerRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }
  function addRow() {
    setRows((prev) => (prev.length >= 3 ? prev : [...prev, newRow()]));
  }
  function removeRow(id: string) {
    setRows((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.id !== id)));
  }
  function applySuggestion(sym: string) {
    setRows((prev) => {
      // Fill the first empty row, else append if room.
      const emptyIdx = prev.findIndex((r) => !r.symbol.trim());
      if (prev.some((r) => r.symbol.trim().toUpperCase() === sym)) return prev;
      if (emptyIdx >= 0) {
        const next = [...prev];
        next[emptyIdx] = { ...next[emptyIdx], symbol: sym };
        return next;
      }
      if (prev.length >= 3) return prev;
      return [...prev, { ...newRow(), symbol: sym }];
    });
  }

  function startStageTicker() {
    setStageIdx(0);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setStageIdx((i) => {
        // Advance but hold on the last stage until the request resolves.
        if (i >= stages.length - 2) return i;
        return i + 1;
      });
    }, 1400);
  }

  async function handleRun() {
    if (!canRun) return;
    setError(null);
    setRunning(true);
    startStageTicker();

    const payload = {
      bot: asset,
      tickers: rows
        .filter((r) => r.symbol.trim())
        .slice(0, 3)
        .map((r) => ({
          symbol: r.symbol.trim().toUpperCase(),
          shares: r.shares.trim() ? Number(r.shares) : null,
          avgPrice: r.avgPrice.trim() ? Number(r.avgPrice) : null,
        })),
    };

    console.log("[trial] Running Zenith report:", payload);
    const res = await api.post<RunResponse>("/api/free-trial/run", payload);

    if (timerRef.current) clearInterval(timerRef.current);

    if (res.ok && res.data) {
      setStageIdx(stages.length - 1);
      // Brief hold on the final stage so the completion reads intentionally.
      setTimeout(() => {
        setResult(res.data!);
        setRunning(false);
        toast.success("Your ZENITH report is ready.");
      }, 700);
    } else {
      const msg = typeof res.error === "string" ? res.error : res.error?.message || "Something went wrong generating your report.";
      console.error("[trial] run failed:", res.error);
      setError(msg);
      setRunning(false);
      toast.error(msg);
    }
  }

  /* ------------------------------- Result ------------------------------- */
  if (result) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <TrialReportView report={result.report} pdfUrl={result.pdfUrl} email={result.email} emailed={result.emailed} />
        <div className="mt-8 overflow-hidden rounded-3xl border border-primary/40 bg-gradient-to-br from-primary/12 to-card/50 p-6 text-center">
          <h3 className="font-display text-xl font-bold">That was your one-time ZENITH run</h3>
          <p className="mx-auto mt-1 max-w-xl text-sm text-muted-foreground">
            Subscribe to run unlimited ULTRA ADVANCED reports across both bots, add live price alerts and receive scheduled
            9am briefings straight to your inbox.
          </p>
          <Link
            href="/pricing"
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-glow transition-opacity hover:opacity-90"
          >
            View subscription plans <ArrowRight className="size-4" />
          </Link>
        </div>
      </div>
    );
  }

  /* ------------------------------ Processing ---------------------------- */
  if (running) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
        <div className="overflow-hidden rounded-3xl border border-border/70 bg-card/50 p-8 text-center">
          <div className="relative mx-auto grid size-20 place-items-center">
            <span className="absolute inset-0 animate-ping rounded-full bg-primary/20" />
            <span className="absolute inset-2 animate-pulse rounded-full bg-primary/15" />
            <span className={cn("relative grid size-14 place-items-center rounded-2xl text-primary-foreground", asset === "crypto" ? "bg-cyan-500" : "bg-violet-500")}>
              {asset === "crypto" ? <Bitcoin className="size-7" /> : <LineChart className="size-7" />}
            </span>
          </div>
          <h2 className="mt-6 font-display text-xl font-bold">
            {asset === "crypto" ? "ZENITH MODE · ULTRA ADVANCED" : "Running ULTRA ADVANCED analysis"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Bot is processing {filledSymbols.join(", ")} against{" "}
            {asset === "crypto" ? "the top 100 cryptocurrencies" : "the entire NZX + ASX market"}.
          </p>

          <ul className="mx-auto mt-7 max-w-md space-y-2 text-left">
            {stages.map((s, i) => {
              const done = i < stageIdx;
              const active = i === stageIdx;
              return (
                <li
                  key={i}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border px-3.5 py-2.5 text-sm transition-colors",
                    active ? "border-primary/50 bg-primary/10 text-foreground" : done ? "border-emerald-500/30 bg-emerald-500/5 text-muted-foreground" : "border-border/50 bg-background/30 text-muted-foreground/60"
                  )}
                >
                  <span className="shrink-0">
                    {done ? (
                      <ShieldCheck className="size-4 text-emerald-600" />
                    ) : active ? (
                      <Loader2 className="size-4 animate-spin text-primary" />
                    ) : (
                      <span className="grid size-4 place-items-center rounded-full border border-border/60 text-[0.6rem]">{i + 1}</span>
                    )}
                  </span>
                  <span>{s}</span>
                </li>
              );
            })}
          </ul>
          <p className="mt-6 text-xs text-muted-foreground">This can take up to a minute — hang tight, we&apos;re analysing live markets.</p>
        </div>
      </div>
    );
  }

  /* -------------------------------- Form -------------------------------- */
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
      {/* Hero */}
      <div className="text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1 text-xs font-semibold text-primary ring-1 ring-primary/25">
          <Zap className="size-3.5" /> One-time free ZENITH report
        </span>
        <h1 className="mt-4 font-display text-3xl font-bold sm:text-4xl">
          {userName ? `Welcome, ${userName}. ` : ""}Run your complimentary intelligence report
        </h1>
        <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
          Enter up to <strong className="text-foreground">3 tickers</strong>, pick a bot, and we&apos;ll generate a full
          ULTRA ADVANCED report — with your portfolio integrated — and email it to you. This is a one-time run.
        </p>
      </div>

      {/* Asset class toggle */}
      <div className="mt-8">
        <p className="mb-2 text-sm font-medium">1 · Choose your bot &amp; asset class</p>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setAsset("crypto")}
            className={cn(
              "flex items-center gap-3 rounded-2xl border p-4 text-left transition-colors",
              asset === "crypto" ? "border-cyan-500/50 bg-cyan-500/10" : "border-border/60 bg-card/40 hover:border-border"
            )}
          >
            <span className={cn("grid size-10 place-items-center rounded-xl", asset === "crypto" ? "bg-cyan-500 text-white" : "bg-muted text-muted-foreground")}>
              <Bitcoin className="size-5" />
            </span>
            <span>
              <span className="block text-sm font-semibold">Crypto bot</span>
              <span className="block text-xs text-muted-foreground">ZENITH · top 100 cryptos</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => setAsset("stock")}
            className={cn(
              "flex items-center gap-3 rounded-2xl border p-4 text-left transition-colors",
              asset === "stock" ? "border-violet-500/50 bg-violet-500/10" : "border-border/60 bg-card/40 hover:border-border"
            )}
          >
            <span className={cn("grid size-10 place-items-center rounded-xl", asset === "stock" ? "bg-violet-500 text-white" : "bg-muted text-muted-foreground")}>
              <LineChart className="size-5" />
            </span>
            <span>
              <span className="block text-sm font-semibold">Stock bot</span>
              <span className="block text-xs text-muted-foreground">Entire NZX + ASX market</span>
            </span>
          </button>
        </div>
      </div>

      {/* Tickers */}
      <div className="mt-8">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-medium">2 · Add up to 3 {asset === "crypto" ? "coins" : "tickers"}</p>
          <span className="text-xs text-muted-foreground">Shares &amp; avg price optional (for portfolio P&amp;L)</span>
        </div>

        <div className="space-y-2.5">
          {rows.map((row, i) => (
            <div key={row.id} className="flex items-center gap-2 rounded-2xl border border-border/60 bg-card/40 p-2.5">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-xs font-bold text-muted-foreground">
                {i + 1}
              </span>
              <input
                value={row.symbol}
                onChange={(e) => updateRow(row.id, { symbol: e.target.value.toUpperCase() })}
                placeholder={asset === "crypto" ? "BTC" : "AIR.NZ"}
                className="h-10 w-24 shrink-0 rounded-lg border border-border/60 bg-background/60 px-3 text-sm font-semibold uppercase outline-none focus:border-primary/60"
              />
              <input
                value={row.shares}
                onChange={(e) => updateRow(row.id, { shares: e.target.value.replace(/[^0-9.]/g, "") })}
                inputMode="decimal"
                placeholder="Shares"
                className="h-10 min-w-0 flex-1 rounded-lg border border-border/60 bg-background/60 px-3 text-sm outline-none focus:border-primary/60"
              />
              <input
                value={row.avgPrice}
                onChange={(e) => updateRow(row.id, { avgPrice: e.target.value.replace(/[^0-9.]/g, "") })}
                inputMode="decimal"
                placeholder="Avg price"
                className="h-10 min-w-0 flex-1 rounded-lg border border-border/60 bg-background/60 px-3 text-sm outline-none focus:border-primary/60"
              />
              <button
                type="button"
                onClick={() => removeRow(row.id)}
                disabled={rows.length <= 1}
                className="grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:text-rose-600 disabled:opacity-30"
                aria-label="Remove ticker"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
        </div>

        {rows.length < 3 && (
          <button
            type="button"
            onClick={addRow}
            className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border/70 px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
          >
            <Plus className="size-3.5" /> Add another {asset === "crypto" ? "coin" : "ticker"}
          </button>
        )}

        {/* Suggestions */}
        <div className="mt-4">
          <p className="mb-1.5 text-xs text-muted-foreground">Quick add:</p>
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => applySuggestion(s)}
                className="rounded-full border border-border/60 bg-background/50 px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Scope callout */}
      <div className="mt-8 flex items-start gap-3 rounded-2xl border border-border/60 bg-background/40 p-4">
        <Gauge className="mt-0.5 size-5 shrink-0 text-primary" />
        <div className="text-xs leading-relaxed text-muted-foreground">
          {asset === "crypto" ? (
            <>
              <strong className="text-foreground">Full scope:</strong> the engine analyses the{" "}
              <strong className="text-foreground">top 100 cryptocurrencies</strong> — top movers over 24h / 7d / 30d,
              fact-based next-move predictions, worldwide crypto news, and a 12-month momentum graph for each coin you enter.
            </>
          ) : (
            <>
              <strong className="text-foreground">Full scope:</strong> the engine sweeps the{" "}
              <strong className="text-foreground">entire NZX + ASX market</strong> — market movers, RSI/MACD signals,
              fact-based next-move predictions, and a 12-month momentum graph for each ticker you enter.
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-5 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={handleRun}
        disabled={!canRun}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-4 font-display text-base font-bold text-primary-foreground shadow-glow transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Sparkles className="size-5" />
        {asset === "crypto" ? "Run ZENITH crypto report" : "Run ULTRA stock report"}
      </button>
      <p className="mt-3 text-center text-xs text-muted-foreground">
        Delivered to your email &amp; shown here · one-time free run · no card required
      </p>
    </div>
  );
}
