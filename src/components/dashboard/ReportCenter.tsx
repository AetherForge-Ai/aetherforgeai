"use client";

/**
 * Report Center — the heart of the subscriber (and free-trial) dashboard.
 *
 *  1. A simple inline form to enter holdings (ticker, shares, purchase price).
 *  2. "Run full SuperGrok 4.3 ULTRA ADVANCED report" buttons per unlocked bot.
 *     Running calls POST /api/reports, which emails the report + PDF, persists it
 *     and returns it for immediate inline display.
 *  3. A history list of past reports, each downloadable as a PDF.
 */

import * as React from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ApexReportView } from "@/components/bots/ApexReport";
import type { ApexReport, BotKind } from "@/lib/apex";
import { BOT_STOCK_MASCOT, BOT_CRYPTO_MASCOT } from "../../../assets/files";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Loader2, Lock, Play, FileDown, Mail, Plus, FileText, Sparkles } from "lucide-react";

type BotAccess = "stock" | "crypto" | "both" | "none";
type AssetType = "stock" | "crypto";

interface PastReport {
  _id: string;
  title: string;
  bot: BotKind;
  marketLabel: string;
  executiveSummary: string;
  emailed: string;
  aiEnhanced: boolean;
  generatedAt: string;
  pdfUrl: string | null;
}

const DEFS: { kind: BotKind; name: string; mascot: string; accent: string; market: string }[] = [
  {
    kind: "stock",
    name: "Stock Market Intelligence Monitor",
    mascot: BOT_STOCK_MASCOT,
    accent: "from-emerald-500/15 to-transparent",
    market: "NZX · ASX · Global equities",
  },
  {
    kind: "crypto",
    name: "Crypto Market Intelligence Monitor",
    mascot: BOT_CRYPTO_MASCOT,
    accent: "from-amber-500/15 to-transparent",
    market: "BTC · ETH · Digital assets",
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
  onHoldingsChanged,
}: {
  botAccess: BotAccess;
  plan?: string | null;
  scope: "total" | "perBot";
  counts: { stock: number; crypto: number; total: number };
  tickerLimit?: number | null;
  onHoldingsChanged: () => void;
}) {
  const [running, setRunning] = React.useState<BotKind | null>(null);
  const [report, setReport] = React.useState<ApexReport | null>(null);
  const [lastPdfUrl, setLastPdfUrl] = React.useState<string | null>(null);
  const [lastAiEnhanced, setLastAiEnhanced] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [history, setHistory] = React.useState<PastReport[]>([]);

  // Inline quick-add holding form
  const [assetType, setAssetType] = React.useState<AssetType>("stock");
  const [ticker, setTicker] = React.useState("");
  const [shares, setShares] = React.useState("");
  const [price, setPrice] = React.useState("");
  const [adding, setAdding] = React.useState(false);

  const canRun = (kind: BotKind) => botAccess === "both" || botAccess === kind;

  // Tickers counted against the plan limit for the currently selected add-type.
  const usedForType = scope === "total" ? counts.total : counts[assetType];
  const atLimit = typeof tickerLimit === "number" && usedForType >= tickerLimit;

  const loadHistory = React.useCallback(async () => {
    const res = await api.get<PastReport[]>("/api/reports");
    if (res.ok && res.data) setHistory(res.data);
    else console.error("[ReportCenter] Failed to load report history:", res.error);
  }, []);

  React.useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  async function addHolding(e: React.FormEvent) {
    e.preventDefault();
    const t = ticker.trim().toUpperCase();
    const s = Number(shares);
    const p = Number(price);
    if (!t) return toast.error("Enter a ticker symbol.");
    if (!(s > 0)) return toast.error("Shares must be greater than 0.");
    if (!(p > 0)) return toast.error("Purchase price must be greater than 0.");
    if (atLimit) {
      return toast.error(
        `You've reached your plan's limit of ${tickerLimit} monitored ${scope === "total" ? "tickers" : assetType + " tickers"}. Upgrade to add more.`
      );
    }

    setAdding(true);
    console.log("[ReportCenter] Adding holding", { t, s, p, assetType });
    const res = await api.post("/api/stocks", {
      ticker: t,
      asset_type: assetType,
      shares: s,
      purchase_price: p,
    });
    setAdding(false);
    if (res.ok) {
      toast.success(`${t} added`);
      setTicker("");
      setShares("");
      setPrice("");
      onHoldingsChanged();
    } else {
      console.error("[ReportCenter] Add holding failed:", res.error);
      toast.error(typeof res.error === "string" ? res.error : "Could not add holding.");
    }
  }

  async function runReport(kind: BotKind) {
    if (!canRun(kind)) {
      toast.error("Your plan does not include this monitor.");
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
    }>("/api/reports", { bot: kind });
    setRunning(null);

    if (!res.ok || !res.data?.report) {
      const msg = typeof res.error === "string" ? res.error : res.error?.message || "Failed to generate the report.";
      console.error("[ReportCenter] run failed:", res.error);
      toast.error(msg);
      return;
    }
    setReport(res.data.report);
    setLastPdfUrl(res.data.pdfUrl);
    setLastAiEnhanced(!!res.data.aiEnhanced);
    setOpen(true);
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
              <Sparkles className="mr-1 size-3" /> Apex State
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Enter your holdings, then run the full SuperGrok 4.3 ULTRA ADVANCED report — delivered to your inbox and here.
          </p>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          <div className="font-display text-lg font-bold text-foreground">
            {usedForType}
            {tickerLimit ? <span className="text-sm text-muted-foreground"> / {tickerLimit}</span> : null}
          </div>
          {scope === "total" ? "tickers monitored" : `${assetType} tickers`}
        </div>
      </div>

      {/* Quick add holding */}
      <form
        onSubmit={addHolding}
        className="mt-5 grid gap-3 rounded-2xl border border-border/60 bg-background/40 p-4 sm:grid-cols-[auto_1fr_1fr_1fr_auto] sm:items-end"
      >
        <div className="space-y-1.5">
          <Label className="text-xs">Type</Label>
          <div className="inline-flex rounded-lg border border-border/60 p-0.5">
            {(["stock", "crypto"] as AssetType[]).map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setAssetType(a)}
                className={cn(
                  "rounded-md px-2.5 py-1.5 text-xs font-medium capitalize transition-colors",
                  assetType === a ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {a}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rc-ticker" className="text-xs">
            {assetType === "crypto" ? "Coin" : "Ticker"}
          </Label>
          <Input
            id="rc-ticker"
            placeholder={assetType === "crypto" ? "BTC" : "AAPL"}
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            className="uppercase"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rc-shares" className="text-xs">
            Shares held
          </Label>
          <Input id="rc-shares" type="number" min="0" step="any" placeholder="10" value={shares} onChange={(e) => setShares(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rc-price" className="text-xs">
            Purchase price
          </Label>
          <Input id="rc-price" type="number" min="0" step="any" placeholder="150.00" value={price} onChange={(e) => setPrice(e.target.value)} />
        </div>
        {atLimit ? (
          <Button asChild variant="outline" className="font-semibold">
            <Link href="/pricing">
              <Lock className="mr-1 size-4" /> Upgrade
            </Link>
          </Button>
        ) : (
          <Button type="submit" disabled={adding} className="font-semibold">
            {adding ? <Loader2 className="size-4 animate-spin" /> : <Plus className="mr-1 size-4" />}
            Add
          </Button>
        )}
      </form>
      {atLimit && (
        <p className="mt-2 text-xs text-[var(--gold)]">
          You&apos;ve reached your {plan === "free" ? "free plan" : "plan"}&apos;s limit of {tickerLimit}{" "}
          monitored {scope === "total" ? "tickers" : `${assetType} tickers`}.{" "}
          <Link href="/pricing" className="font-semibold underline">
            Upgrade
          </Link>{" "}
          to monitor more.
        </p>
      )}

      {/* Run buttons */}
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        {DEFS.map((b) => {
          const unlocked = canRun(b.kind);
          const busy = running === b.kind;
          return (
            <div
              key={b.kind}
              className={`relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br ${b.accent} p-5`}
            >
              <div className="flex items-start gap-4">
                <img src={b.mascot} alt={`${b.name} mascot`} className="h-14 w-14 shrink-0 rounded-xl object-cover ring-1 ring-border/60" />
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold leading-tight">{b.name}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">{b.market}</p>
                </div>
              </div>
              <div className="mt-4">
                {unlocked ? (
                  <Button className="w-full" onClick={() => runReport(b.kind)} disabled={busy || running !== null}>
                    {busy ? (
                      <>
                        <Loader2 className="mr-1 size-4 animate-spin" /> Compiling report…
                      </>
                    ) : (
                      <>
                        <Play className="mr-1 size-4" /> Run full report
                      </>
                    )}
                  </Button>
                ) : (
                  <Button asChild variant="outline" className="w-full">
                    <Link href="/pricing">
                      <Lock className="mr-1 size-4" /> Unlock this monitor
                    </Link>
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Report history */}
      <div className="mt-6">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <FileText className="size-4 text-primary" /> Your reports
        </div>
        {history.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border/60 p-4 text-sm text-muted-foreground">
            No reports yet — add your holdings above and run your first report.
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
                      <Badge variant="outline" className="border-emerald-500/30 text-emerald-400">
                        <Mail className="mr-1 size-3" /> Emailed
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
                  <DialogTitle>{report?.title ?? "Apex report"}</DialogTitle>
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
