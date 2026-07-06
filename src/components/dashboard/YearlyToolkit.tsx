"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { FileSpreadsheet, Download, Loader2, Table2, ListChecks, Gauge } from "lucide-react";

/**
 * Annual-subscriber perk: a professional, working Excel investor toolkit
 * (Portfolio Tracker + Transactions ledger + Performance Summary) pre-filled
 * with the customer's own holdings. Only rendered for yearly / dual_yearly
 * subscribers; the download endpoint enforces the same entitlement server-side.
 */
export function YearlyToolkit() {
  const [downloading, setDownloading] = useState(false);

  async function handleDownload() {
    setDownloading(true);
    console.log("[toolkit] Requesting Excel toolkit download…");
    try {
      const res = await fetch("/api/downloads/toolkit", { method: "GET" });
      if (!res.ok) {
        let message = "Could not generate your toolkit.";
        try {
          const body = (await res.json()) as { ok: boolean; error?: string };
          if (body?.error) message = body.error;
        } catch {
          /* non-JSON error body — keep default message */
        }
        console.error("[toolkit] Download failed:", res.status, message);
        toast.error(message);
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "Ultra-Advanced-Portfolio-Tracker-Stocks-Crypto-NZD.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      console.log("[toolkit] Download started");
      toast.success("Your Excel toolkit is downloading");
    } catch (err) {
      console.error("[toolkit] Unexpected download error:", err);
      toast.error("Something went wrong preparing your toolkit.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="relative overflow-hidden rounded-3xl border border-[var(--gold)]/30 bg-gradient-to-br from-[var(--gold)]/10 via-card/50 to-card/50 p-6 sm:p-8">
      <div
        className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full bg-[var(--gold)]/10 blur-3xl"
        aria-hidden
      />
      <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-[var(--gold)]/40 bg-[var(--gold)]/10 px-3 py-1 text-xs font-semibold text-[var(--gold)]">
            <FileSpreadsheet className="size-3.5" /> Annual member exclusive
          </div>
          <h2 className="mt-3 font-display text-2xl font-bold tracking-tight">
            Your Professional Investor Toolkit
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            As a yearly subscriber, you get our full suite of professional, ready-to-use Excel
            spreadsheets — a <strong className="text-foreground/90">Portfolio Tracker</strong> and a{" "}
            <strong className="text-foreground/90">Transactions ledger</strong> — pre-loaded with your
            current holdings and powered by live formulas.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            We strongly recommend you download this toolkit and use it every week to monitor your own
            performance and record every transaction. Disciplined record-keeping — reconciling your
            holdings and logging your trades — is the single most reliable habit for understanding
            exactly how your capital is performing. Paired with your AetherForge AI intelligence
            reports, it gives you a clear, defensible picture of your portfolio over time.
          </p>

          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            {[
              { icon: Table2, label: "Portfolio Tracker" },
              { icon: ListChecks, label: "Transactions ledger" },
              { icon: Gauge, label: "Performance summary" },
            ].map((f) => (
              <div
                key={f.label}
                className="flex items-center gap-2 rounded-xl border border-border/60 bg-background/40 px-3 py-2 text-xs font-medium"
              >
                <f.icon className="size-4 shrink-0 text-[var(--gold)]" />
                {f.label}
              </div>
            ))}
          </div>
        </div>

        <div className="shrink-0">
          <Button
            onClick={handleDownload}
            disabled={downloading}
            size="lg"
            className="h-12 w-full px-6 text-base font-semibold shadow-glow lg:w-auto"
          >
            {downloading ? (
              <>
                <Loader2 className="mr-2 size-5 animate-spin" /> Preparing…
              </>
            ) : (
              <>
                <Download className="mr-2 size-5" /> Download Excel toolkit
              </>
            )}
          </Button>
          <p className="mt-2 text-center text-[11px] text-muted-foreground lg:text-right">
            .xlsx · opens in Excel, Numbers &amp; Google Sheets
          </p>
        </div>
      </div>
    </div>
  );
}

export default YearlyToolkit;
