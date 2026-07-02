"use client";

/**
 * Home-page centerpiece: the two Zenith-Mode intelligence bots.
 *
 * Each card opens a modal showing the bot's cartoon mascot and a DEMO version
 * of the Zenith report — illustrative data, but the exact layout a subscriber
 * receives in their dashboard (lists compiled, data analysed, 7-day short-term
 * predictions, 3 forward pathways and a 12-month per-company continuation
 * graph). A subscribe CTA converts the visitor.
 */

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ZenithReportView } from "@/components/bots/ZenithReport";
import { buildDemoReport, type BotKind } from "@/lib/zenith";
import { BOT_STOCK_MASCOT, BOT_CRYPTO_MASCOT } from "../../../assets/files";

interface BotDef {
  kind: BotKind;
  name: string;
  mascot: string;
  blurb: string;
  accent: string; // tailwind gradient classes
  tags: string[];
}

const BOTS: BotDef[] = [
  {
    kind: "stock",
    name: "Stock Market Intelligence Monitor",
    mascot: BOT_STOCK_MASCOT,
    blurb:
      "Sweeps NZX, ASX and global equities in Zenith Mode — compiling institutional-grade tables, top-gainer boards and 12-month continuation graphs for every ticker you monitor.",
    accent: "from-emerald-500/20 via-teal-500/10 to-transparent",
    tags: ["NZX", "ASX", "Global equities"],
  },
  {
    kind: "crypto",
    name: "Crypto Market Intelligence Monitor",
    mascot: BOT_CRYPTO_MASCOT,
    blurb:
      "Tracks BTC, ETH and the broader digital-asset market in Zenith Mode — synthesising funding, flows and sentiment into clear 7-day projections and three forward pathways.",
    accent: "from-amber-500/20 via-orange-500/10 to-transparent",
    tags: ["BTC", "ETH", "Digital assets"],
  },
];

function BotCard({ bot, onOpen }: { bot: BotDef; onOpen: () => void }) {
  return (
    <div
      className={`group relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br ${bot.accent} p-6 transition-all hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5`}
    >
      <div className="flex items-start gap-4">
        <div className="relative shrink-0">
          <div className="absolute inset-0 rounded-full bg-primary/20 blur-xl" aria-hidden />
          <img
            src={bot.mascot}
            alt={`${bot.name} mascot`}
            className="relative h-24 w-24 rounded-2xl object-cover ring-1 ring-border/60"
            loading="lazy"
          />
        </div>
        <div className="min-w-0">
          <Badge variant="outline" className="mb-2 border-primary/30 bg-primary/10 text-primary">
            ⚡ Zenith Mode
          </Badge>
          <h3 className="text-lg font-semibold leading-tight tracking-tight">{bot.name}</h3>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {bot.tags.map((t) => (
              <span key={t} className="rounded-md border border-border/60 bg-background/40 px-2 py-0.5 text-[11px] text-muted-foreground">
                {t}
              </span>
            ))}
          </div>
        </div>
      </div>

      <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{bot.blurb}</p>

      <Button onClick={onOpen} className="mt-5 w-full" variant="secondary">
        View a sample Zenith report
      </Button>
    </div>
  );
}

export function BotShowcase() {
  const [openKind, setOpenKind] = React.useState<BotKind | null>(null);

  // Build demo reports once, lazily, and memoise so charts stay stable.
  const reports = React.useMemo(
    () => ({ stock: buildDemoReport("stock"), crypto: buildDemoReport("crypto") }),
    []
  );
  const activeBot = BOTS.find((b) => b.kind === openKind) || null;

  return (
    <section className="mx-auto max-w-6xl px-4 py-20 md:py-28">
      <div className="text-center">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">The core of AetherForge</p>
        <h2 className="mt-3 text-3xl font-bold tracking-tight md:text-4xl">
          Two Ultra-Advanced AI bots. One Zenith State.
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
          Powered by SuperGrok 4.3, each monitor runs an exhaustive multi-timeframe sweep and delivers the finished
          intelligence straight into your dashboard. Open one to preview exactly what a subscriber receives.
        </p>
      </div>

      <div className="mt-12 grid gap-6 md:grid-cols-2">
        {BOTS.map((bot) => (
          <BotCard key={bot.kind} bot={bot} onOpen={() => setOpenKind(bot.kind)} />
        ))}
      </div>

      <Dialog open={openKind !== null} onOpenChange={(o) => !o && setOpenKind(null)}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          {activeBot && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-4">
                  <img
                    src={activeBot.mascot}
                    alt={`${activeBot.name} mascot`}
                    className="h-16 w-16 shrink-0 rounded-xl object-cover ring-1 ring-border/60"
                  />
                  <div>
                    <DialogTitle className="text-left text-lg">{activeBot.name}</DialogTitle>
                    <DialogDescription className="text-left">
                      Sample Zenith-State report — illustrative data, real subscriber layout. This is what lands in your
                      dashboard when the bot runs.
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              <div className="mt-2">
                <ZenithReportView report={reports[activeBot.kind]} />
              </div>

              <div className="mt-4 flex flex-col items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 p-5 text-center">
                <p className="text-sm font-medium">
                  Unlock live Zenith reports on your own {activeBot.kind === "crypto" ? "coins" : "tickers"}.
                </p>
                <Button asChild className="w-full sm:w-auto">
                  <Link href="/pricing">Choose a plan &amp; activate this bot</Link>
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}

export default BotShowcase;
