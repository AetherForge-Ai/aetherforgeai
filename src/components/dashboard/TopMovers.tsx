"use client";

import { useMemo, useState } from "react";
import { getTopMovers, formatMarketPrice, type MoverWindow, type SecurityIntel } from "@/lib/market-intel";
import { cn } from "@/lib/utils";
import { pctClass, fmtPct, MarketChip } from "@/components/dashboard/intel-ui";
import { useMarketIntel } from "@/components/dashboard/MarketIntelContext";
import { useCryptoMarkets } from "@/hooks/useCryptoMarkets";
import { coinDisplayName } from "@/lib/crypto-names";
import { TrendingUp, TrendingDown, Flame } from "lucide-react";

const WINDOWS: { key: MoverWindow; label: string }[] = [
  { key: "1d", label: "24 Hrs" },
  { key: "7d", label: "7 Days" },
  { key: "30d", label: "1 Month" },
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

function CryptoTopMovers() {
  const [w, setW] = useState<MoverWindow>("1d");
  const crypto = useCryptoMarkets(true);
  const ranked = useMemo(() => {
    const rows = crypto.coins
      .map((coin) => {
        const change = w === "1d" ? coin.change24h : w === "7d" ? coin.change7d : coin.moves?.d30;
        return {
          ticker: coin.symbol,
          name: coinDisplayName(coin.symbol, coin.name),
          price: coin.price,
          change: typeof change === "number" && Number.isFinite(change) ? change : null,
        };
      })
      .filter((row): row is { ticker: string; name: string; price: number; change: number } => row.change != null && row.price > 0);
    const gainers = [...rows].sort((a, b) => b.change - a.change).slice(0, 6);
    const losers = [...rows].sort((a, b) => a.change - b.change).filter((row) => row.change < 0).slice(0, 6);
    return { gainers, losers };
  }, [crypto.coins, w]);

  return (
    <section className="rounded-3xl border border-border/70 bg-card/50 p-6">
      <MoverHeader w={w} setW={setW} subtitle="Biggest gainers and losers on the live coin list" />
      {crypto.loading && crypto.coins.length === 0 ? (
        <div className="mt-5 grid min-h-[220px] gap-6 md:grid-cols-2" aria-busy="true">
          <p className="text-sm text-muted-foreground">Loading movers…</p>
          <div className="hidden h-[180px] animate-pulse rounded-xl bg-muted/40 md:block" />
        </div>
      ) : ranked.gainers.length === 0 && ranked.losers.length === 0 ? (
        <p className="mt-5 text-sm text-muted-foreground">No coin moves in this list.</p>
      ) : (
        <div className="mt-5 grid gap-6 md:grid-cols-2">
          <MoverColumn title="Gainers" tone="up" rows={ranked.gainers} />
          <MoverColumn title="Losers" tone="down" rows={ranked.losers} />
        </div>
      )}
    </section>
  );
}

function MoverHeader({
  w,
  setW,
  subtitle,
}: {
  w: MoverWindow;
  setW: (next: MoverWindow) => void;
  subtitle: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <span className="grid size-9 place-items-center rounded-lg bg-primary/12 text-primary">
          <Flame className="size-4" />
        </span>
        <div>
          <h2 className="font-display text-lg font-bold">Top movers</h2>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      <div className="flex rounded-lg border border-border/60 p-0.5">
        {WINDOWS.map((win) => (
          <button
            key={win.key}
            type="button"
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
  );
}

function MoverColumn({
  title,
  tone,
  rows,
}: {
  title: string;
  tone: "up" | "down";
  rows: Array<{ ticker: string; name: string; price: number; change: number }>;
}) {
  return (
    <div>
      <div
        className={cn(
          "mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide",
          tone === "up" ? "text-emerald-700" : "text-rose-600"
        )}
      >
        {tone === "up" ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />} {title}
      </div>
      <div className="divide-y divide-border/40">
        {rows.map((row) => (
          <div key={row.ticker} className="flex items-center gap-3 py-2">
            <div className="min-w-0 flex-1">
              <span className="font-display text-sm font-semibold">{row.ticker}</span>
              <p className="truncate text-[0.68rem] text-muted-foreground">{row.name}</p>
            </div>
            <span className="tnum text-sm text-muted-foreground">{formatMarketPrice(row.price, "USD")}</span>
            <span className={cn("tnum w-20 text-right text-sm font-semibold", pctClass(row.change))}>{fmtPct(row.change)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function TopMovers({ assetClass = "equity" }: { assetClass?: "equity" | "crypto" }) {
  if (assetClass === "crypto") return <CryptoTopMovers />;
  return <EquityTopMovers />;
}

function EquityTopMovers() {
  const [w, setW] = useState<MoverWindow>("1d");
  const { universe } = useMarketIntel();
  const { gainers, losers } = useMemo(() => getTopMovers(w, 6, universe ?? undefined), [w, universe]);

  return (
    <section className="rounded-3xl border border-border/70 bg-card/50 p-6">
      <MoverHeader w={w} setW={setW} subtitle="Biggest gainers & losers across all markets" />

      <div className="mt-5 grid gap-6 md:grid-cols-2">
        <div>
          <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-emerald-700">
            <TrendingUp className="size-3.5" /> Gainers
          </div>
          <div className="divide-y divide-border/40">
            {gainers.map((s) => (
              <MoverRow key={s.ticker} s={s} w={w} />
            ))}
          </div>
        </div>
        <div>
          <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-rose-600">
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
