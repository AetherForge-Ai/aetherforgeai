"use client";

/**
 * Dashboard Zenith-Mode bot runners. Shows the two AI monitors; the user can
 * RUN whichever their plan unlocks (stock / crypto / both). Running calls
 * POST /api/bot/run and renders the resulting live ZenithReport in a modal.
 */

import * as React from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ZenithReportView } from "@/components/bots/ZenithReport";
import type { ZenithReport, BotKind } from "@/lib/zenith";
import { BOT_STOCK_MASCOT, BOT_CRYPTO_MASCOT } from "../../../assets/files";
import { toast } from "sonner";
import { Loader2, Lock, Play } from "lucide-react";

interface Props {
  botAccess: "stock" | "crypto" | "both" | "none";
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

export function ZenithBots({ botAccess }: Props) {
  const [running, setRunning] = React.useState<BotKind | null>(null);
  const [report, setReport] = React.useState<ZenithReport | null>(null);
  const [open, setOpen] = React.useState(false);

  const canRun = (kind: BotKind) => botAccess === "both" || botAccess === kind;

  async function runBot(kind: BotKind) {
    if (!canRun(kind)) {
      toast.error("Your plan does not include this bot.");
      return;
    }
    setRunning(kind);
    console.log(`[ZenithBots] Running ${kind} bot`);
    const res = await api.post<{ report: ZenithReport; monitored: number }>("/api/bot/run", { bot: kind });
    setRunning(null);

    if (!res.ok || !res.data?.report) {
      const msg = typeof res.error === "string" ? res.error : res.error?.message || "Failed to run the bot.";
      console.error("[ZenithBots] run failed:", res.error);
      toast.error(msg);
      return;
    }
    setReport(res.data.report);
    setOpen(true);
    toast.success(`Zenith run complete — ${res.data.monitored} monitored ${kind === "crypto" ? "assets" : "tickers"}.`);
  }

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Zenith-Mode bots</h2>
          <p className="text-sm text-muted-foreground">Run an Ultra-Advanced SuperGrok 4.3 sweep on your holdings.</p>
        </div>
        <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
          ⚡ Zenith State
        </Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {DEFS.map((b) => {
          const unlocked = canRun(b.kind);
          const busy = running === b.kind;
          return (
            <div
              key={b.kind}
              className={`relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br ${b.accent} p-5`}
            >
              <div className="flex items-start gap-4">
                <img
                  src={b.mascot}
                  alt={`${b.name} mascot`}
                  className="h-16 w-16 shrink-0 rounded-xl object-cover ring-1 ring-border/60"
                />
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold leading-tight">{b.name}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">{b.market}</p>
                </div>
              </div>

              <div className="mt-4">
                {unlocked ? (
                  <Button className="w-full" onClick={() => runBot(b.kind)} disabled={busy}>
                    {busy ? (
                      <>
                        <Loader2 className="mr-1 size-4 animate-spin" /> Running Zenith sweep…
                      </>
                    ) : (
                      <>
                        <Play className="mr-1 size-4" /> Run this bot
                      </>
                    )}
                  </Button>
                ) : (
                  <Button asChild variant="outline" className="w-full">
                    <Link href="/pricing">
                      <Lock className="mr-1 size-4" /> Unlock this bot
                    </Link>
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{report?.title ?? "Zenith report"}</DialogTitle>
            <DialogDescription>
              Live Zenith-State intelligence built from your monitored holdings.
            </DialogDescription>
          </DialogHeader>
          {report && <ZenithReportView report={report} />}
        </DialogContent>
      </Dialog>
    </section>
  );
}

export default ZenithBots;
