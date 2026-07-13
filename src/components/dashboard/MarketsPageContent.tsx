"use client";

import { MarketsExplorer } from "@/components/dashboard/MarketsExplorer";
import { OpenMarketSnapshot } from "@/components/dashboard/OpenMarketSnapshot";
import { LineChart, Globe } from "lucide-react";

/**
 * Full-page Stock Markets view. Wraps the shared MarketsExplorer in a spacious,
 * dashboard-consistent card. Buying is disabled in guest preview.
 */
export function MarketsPageContent({ preview = false }: { preview?: boolean }) {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Page header */}
      <div className="flex flex-wrap items-center gap-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary/15 text-primary">
          <LineChart className="size-6" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl font-bold">Stock Markets</h1>
            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider text-emerald-300">
              ● Live
            </span>
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Every live ticker across NZX · ASX · Dow Jones &amp; NASDAQ — price, % change &amp; volume.
            Search, sort and filter the whole market.
          </p>
        </div>
      </div>

      {/* Quick cross-market pulse — prominent near the top of the page */}
      <div className="mt-6">
        <OpenMarketSnapshot onBought={preview ? undefined : () => window.location.reload()} />
      </div>

      {/* Live browser */}
      <div className="mt-6 rounded-3xl border border-border/70 bg-card/50 p-4 sm:p-6">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <Globe className="size-4 text-primary" /> Market snapshot
        </div>
        <MarketsExplorer
          active
          className="h-[70vh]"
          onBought={preview ? undefined : () => window.location.reload()}
        />
      </div>

      {preview && (
        <p className="mt-4 text-center text-xs text-muted-foreground">
          You&apos;re viewing a live preview. Create a free account to buy and track positions.
        </p>
      )}
    </div>
  );
}
