"use client";

/**
 * Crypto Market surface for the dashboard's Crypto Bot view.
 *
 * Owns the shared modal state so the Coin Detail modal always layers ABOVE the
 * Crypto Market table modal — reopening the table preserves its search/sort/
 * scroll because the table modal component stays mounted the whole time.
 *
 * The "Crypto Market" button, the Projected Performers panel and the Top-500
 * table all read from the same `useCryptoMarkets` cache (one network fetch).
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CryptoMarketModal } from "./CryptoMarketModal";
import { CoinDetailModal } from "./CoinDetailModal";
import { ProjectedPerformers } from "./ProjectedPerformers";
import { useCryptoMarkets } from "@/hooks/useCryptoMarkets";
import { cryptoCoveragePhrase } from "@/lib/crypto-coverage";
import { LineChart, TrendingUp } from "lucide-react";

export function CryptoMarketSection({ showProjected = true }: { showProjected?: boolean }) {
  const [marketOpen, setMarketOpen] = useState(false);
  const [coinId, setCoinId] = useState<string | null>(null);
  const [coinOpen, setCoinOpen] = useState(false);

  // Warm the shared cache as soon as the crypto view mounts so the button and
  // performers feel instant. (active=true drives the fetch/interval.)
  const { coins, loading } = useCryptoMarkets(true);

  function openCoin(id: string) {
    setCoinId(id);
    setCoinOpen(true);
  }

  return (
    <section className="space-y-4">
      {/* Primary CTA */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/10 to-card/40 p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-primary/15 text-primary">
            <TrendingUp className="size-5" />
          </span>
          <div>
            <p className="font-display text-base font-semibold">Institutional Crypto Terminal</p>
            <p className="text-xs text-muted-foreground">
              {loading && coins.length === 0
                ? "Loading live market data…"
                : `${cryptoCoveragePhrase(coins.length)} · USD`}
            </p>
          </div>
        </div>
        <Button size="lg" className="gap-2 font-semibold shadow-glow" onClick={() => setMarketOpen(true)}>
          <LineChart className="size-5" />
          Crypto Market
        </Button>
      </div>

      {/* Projected Performers (full-500 scan) */}
      {showProjected ? <ProjectedPerformers active onSelectCoin={openCoin} /> : (
        <p className="rounded-2xl border border-border/70 bg-card/40 p-4 text-sm text-muted-foreground">
          Projected performers are on a paid plan.{" "}
          <a href="/pricing" className="font-medium text-primary hover:underline">See plans</a>
        </p>
      )}

      {/* Modals — table stays mounted to preserve state; detail layers above it */}
      <CryptoMarketModal open={marketOpen} onOpenChange={setMarketOpen} onSelectCoin={openCoin} />
      <CoinDetailModal coinId={coinId} open={coinOpen} onOpenChange={setCoinOpen} />
    </section>
  );
}
