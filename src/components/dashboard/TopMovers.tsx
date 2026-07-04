"use client";

import { useMemo, useState } from "react";
import { getTopMovers, formatMarketPrice, type MoverWindow, type SecurityIntel } from "@/lib/market-intel";
import { cn } from "@/lib/utils";
import { pctClass, fmtPct, MarketChip } from "@/components/dashboard/intel-ui";
import { useMarketIntel } from "@/components/dashboard/MarketIntelContext";
import { TrendingUp, TrendingDown, Flame } from "lucide-react";

const WINDOWS: { key: MoverWindow; label: string }[] = [
  { key: "1d", label: "1 Day" },
  { key: "7d", label: "7 Day" },
  { key: "30d", label: "30 Day" },
];

function changeFor(s: SecurityIntel, w: MoverWindow): number {
  return w === "1d" ? s.change1d : w === "7d" ? s.change7d : s.change30d;
}

function MoverRow({ s, w }: { s: SecurityIntel; w: MoverWindow }) {
  const change = changeFor(s, w);
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="font-display text-sm font-semibold">{s.ticker.replace(/\.(NZ|AX)$/, "")}</span>
          <MarketChip market={s.market} />
        </div>
        <p className="truncate text-[0.68rem] text-muted-foreground">{s.name}</p>
      </div>
      <span className="tnum text-sm text-muted-foreground">{formatMarketPrice(s.price, s.currency)}</span>
      <span className={cn("tnum w-20 text-right text-sm font-semibold", pctClass(change))}>{fmtPct(change)}</span>
    </div>
  );
}

export function TopMovers() {
  const [w, setW] = useState<MoverWindow>("1d");
  const { universe } = useMarketIntel();
  const { gainers, losers } = useMemo(() => getTopMovers(w, 6, universe ?? undefined), [w, universe]);

  return (
    <section className="rounded-3xl border border-border/70 bg-card/50 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-lg bg-primary/12 text-primary">
            <Flame className="size-4" />
          </span>
          <div>
            <h2 className="font-display text-lg font-bold">Top movers</h2>
            <p className="text-xs text-muted-foreground">Biggest gainers &amp; losers across all markets</p>
          </div>
        </div>
        <div className="flex rounded-lg border border-border/60 p-0.5">
          {WINDOWS.map((win) => (
            <button
              key={win.key}
              onClick={() => setW(win.key)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                w === win.key ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {win.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 grid gap-6 md:grid-cols-2">
        <div>
          <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-emerald-400">
            <TrendingUp className="size-3.5" /> Gainers
          </div>
          <div className="divide-y divide-border/40">
            {gainers.map((s) => (
              <MoverRow key={s.ticker} s={s} w={w} />
            ))}
          </div>
        </div>
        <div>
          <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-rose-400">
            <TrendingDown className="size-3.5" /> Losers
          </div>
          <div className="divide-y divide-border/40">
            {losers.map((s) => (
              <MoverRow key={s.ticker} s={s} w={w} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
