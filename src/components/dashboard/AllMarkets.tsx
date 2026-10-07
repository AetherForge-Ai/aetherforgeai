"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MarketsExplorer } from "@/components/dashboard/MarketsExplorer";
import { Globe, Layers } from "lucide-react";

/**
 * "ALL Markets" dashboard card → opens a large modal wrapping the shared
 * MarketsExplorer (live cross-exchange table). The full-page version of the
 * same browser lives at /markets (the Stock Markets nav item).
 */
export function AllMarkets({
  onBought,
  scope = "equity",
}: {
  onBought?: () => void;
  scope?: "equity" | "crypto";
}) {
  const [open, setOpen] = useState(false);
  const blurb =
    scope === "crypto"
      ? "Coin prices, change and volume. A failed load says so."
      : "NZX, ASX, Dow Jones and NASDAQ — price, change and volume. A failed load says so.";
  const dialogBlurb =
    scope === "crypto"
      ? "Prices across the coin list. Search a name. A failed load says so."
      : "Prices across the exchanges. Pick a market and search. A failed load says so.";

  return (
    <section>
      {/* Prominent dashboard card — opens the ALL Markets view */}
      <button
        onClick={() => setOpen(true)}
        className="group flex w-full items-center gap-4 rounded-3xl border border-primary/30 bg-gradient-to-br from-primary/12 via-card/60 to-card/50 p-6 text-left shadow-glow transition-colors hover:border-primary/50"
      >
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary/15 text-primary">
          <Globe className="size-6" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="font-display text-lg font-bold">ALL Markets</h2>
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">{blurb}</p>
        </div>
        <span className="hidden shrink-0 items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-transform group-hover:scale-[1.03] sm:inline-flex">
          <Layers className="size-4" /> Search Markets
        </span>
      </button>

      {/* ALL Markets modal */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[90vh] w-[90vw] max-w-[112rem] flex-col gap-0 overflow-hidden p-6">
          <DialogHeader className="pb-2">
            <DialogTitle className="flex items-center gap-2 font-display text-xl">
              <Globe className="size-5 text-primary" /> ALL Markets
            </DialogTitle>
            <DialogDescription>{dialogBlurb}</DialogDescription>
          </DialogHeader>

          <MarketsExplorer active={open} onBought={onBought} className="min-h-0 flex-1" />
        </DialogContent>
      </Dialog>
    </section>
  );
}
