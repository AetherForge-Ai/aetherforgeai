"use client";

import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Sparkline } from "./Sparkline";
import { useCryptoMarkets } from "@/hooks/useCryptoMarkets";
import {
  rankPerformers,
  fmtPrice,
  fmtCompactUsd,
  fmtPct,
  pctColor,
  type RankedPerformer,
} from "@/lib/crypto-market";
import {
  TrendingUp,
  RefreshCw,
  Info,
  ChevronRight,
  ArrowUpRight,
  AlertTriangle,
  Loader2,
} from "lucide-react";

const FORMULA_TEXT =
  "Ranked across a full 500-coin scan by a momentum composite (0.7 × 24h % + 0.3 × 7d %), positive-24h names only, with a $250k+ 24h-volume liquidity filter.";

export function ProjectedPerformers({
  active,
  onSelectCoin,
}: {
  active: boolean;
  onSelectCoin: (id: string) => void;
}) {
  const { coins, loading, refreshing, lastUpdated, refresh } = useCryptoMarkets(active);
  const [top20Open, setTop20Open] = useState(false);

  const top8 = useMemo(() => rankPerformers(coins, 8), [coins]);
  const top20 = useMemo(() => rankPerformers(coins, 20), [coins]);

  const lastLabel = lastUpdated
    ? lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "—";

  return (
    <section className="rounded-2xl border border-border/60 bg-card/40 p-4 sm:p-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="grid size-9 place-items-center rounded-xl bg-emerald-500/12 text-emerald-400">
            <TrendingUp className="size-4.5" />
          </span>
          <div>
            <h3 className="flex items-center gap-1.5 font-display text-base font-semibold">
              Projected Performers
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button aria-label="How performers are ranked" className="text-muted-foreground hover:text-foreground">
                      <Info className="size-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs text-xs leading-relaxed">
                    {FORMULA_TEXT}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </h3>
            <p className="text-[0.66rem] text-muted-foreground">
              Full 500-coin scan · last scan {lastLabel}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => setTop20Open(true)}
            disabled={loading}
          >
            View Top 20 Performers
            <Badge variant="secondary" className="ml-0.5 px-1.5 py-0 text-[0.62rem]">20</Badge>
          </Button>
          <Button variant="ghost" size="icon" className="size-8" onClick={refresh} disabled={loading || refreshing}>
            <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* Broad-market-down honesty banner */}
      {top8.marketBroadlyDown && !loading && (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/8 px-3 py-2 text-[0.72rem] text-amber-300/90">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          The market is broadly negative right now — these are the strongest relative names from the full 500-coin scan, not absolute gainers.
        </div>
      )}

      {/* Cards */}
      <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
        {loading
          ? Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-[92px] rounded-xl" />)
          : top8.performers.map((c, i) => (
              <PerformerCard key={c.id} coin={c} rank={i + 1} onClick={() => onSelectCoin(c.id)} />
            ))}
      </div>

      {/* Top 20 modal */}
      <Dialog open={top20Open} onOpenChange={setTop20Open}>
        <DialogContent className="flex max-h-[90vh] w-[96vw] max-w-4xl flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b border-border/60 px-5 py-4 sm:px-6">
            <DialogTitle className="font-display text-lg">
              Top 20 Actual Performers <span className="text-muted-foreground">— Full 500 Coin Scan</span>
            </DialogTitle>
            <DialogDescription className="text-xs">{FORMULA_TEXT}</DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {/* header row */}
            <div className="sticky top-0 z-10 grid grid-cols-[36px_minmax(120px,1.5fr)_repeat(3,minmax(72px,1fr))_110px_100px_36px] items-center gap-2 border-b border-border/60 bg-popover px-4 py-2 text-[0.6rem] font-semibold uppercase tracking-wide text-muted-foreground sm:px-6">
              <span>#</span>
              <span>Coin</span>
              <span className="text-right">Price</span>
              <span className="text-right">24h</span>
              <span className="text-right">7d</span>
              <span className="text-right">Market Cap</span>
              <span className="text-center">7d</span>
              <span />
            </div>
            {loading ? (
              <div className="flex h-40 items-center justify-center text-muted-foreground">
                <Loader2 className="mr-2 size-5 animate-spin" /> Scanning…
              </div>
            ) : (
              top20.performers.map((c, i) => (
                <button
                  key={c.id}
                  onClick={() => {
                    setTop20Open(false);
                    onSelectCoin(c.id);
                  }}
                  className="grid w-full grid-cols-[36px_minmax(120px,1.5fr)_repeat(3,minmax(72px,1fr))_110px_100px_36px] items-center gap-2 border-b border-border/40 px-4 py-2 text-sm transition hover:bg-primary/5 sm:px-6"
                >
                  <span className="tnum text-xs font-semibold text-emerald-400">{i + 1}</span>
                  <span className="flex min-w-0 items-center gap-2 text-left">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={c.image} alt="" className="size-6 shrink-0 rounded-full" loading="lazy" />
                    <span className="min-w-0">
                      <span className="block truncate font-medium leading-tight">{c.name}</span>
                      <span className="block text-[0.64rem] uppercase text-muted-foreground">{c.symbol}</span>
                    </span>
                  </span>
                  <span className="tnum text-right font-medium">{fmtPrice(c.price)}</span>
                  <span className={cn("tnum text-right font-semibold", pctColor(c.change24h))}>{fmtPct(c.change24h)}</span>
                  <span className={cn("tnum text-right font-semibold", pctColor(c.change7d))}>{fmtPct(c.change7d)}</span>
                  <span className="tnum text-right text-muted-foreground">{fmtCompactUsd(c.marketCap)}</span>
                  <span className="flex justify-center">
                    <Sparkline data={c.sparkline7d} width={72} height={26} />
                  </span>
                  <span className="flex justify-end text-muted-foreground">
                    <ChevronRight className="size-4" />
                  </span>
                </button>
              ))
            )}
          </div>
          <div className="border-t border-border/60 px-4 py-2 text-center text-[0.62rem] text-muted-foreground sm:px-6">
            Data via CoinGecko (may be delayed up to ~60s)
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function PerformerCard({
  coin,
  rank,
  onClick,
}: {
  coin: RankedPerformer;
  rank: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="group flex items-center gap-3 rounded-xl border border-border/60 bg-background/40 px-3 py-2.5 text-left transition hover:border-emerald-500/40 hover:bg-emerald-500/5"
    >
      <span className="tnum w-4 shrink-0 text-center text-xs font-bold text-muted-foreground">{rank}</span>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={coin.image} alt="" className="size-8 shrink-0 rounded-full" loading="lazy" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold leading-tight">{coin.name}</p>
        <p className="text-[0.64rem] uppercase text-muted-foreground">{coin.symbol}</p>
        <p className="tnum mt-0.5 text-xs font-medium">{fmtPrice(coin.price)}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className={cn("tnum inline-flex items-center gap-0.5 text-sm font-bold", pctColor(coin.change24h))}>
          <ArrowUpRight className={cn("size-3.5", coin.change24h < 0 && "rotate-90")} />
          {fmtPct(coin.change24h)}
        </span>
        <Sparkline data={coin.sparkline7d} width={64} height={22} />
      </div>
    </button>
  );
}
