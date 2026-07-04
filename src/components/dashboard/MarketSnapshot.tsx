"use client";

import { useMemo, useState } from "react";
import {
  getMarketSnapshot,
  formatMarketPrice,
  type MarketCode,
  type SecurityIntel,
} from "@/lib/market-intel";
import { cn } from "@/lib/utils";
import { SignalBadge, pctClass, fmtPct } from "@/components/dashboard/intel-ui";
import { useMarketIntel } from "@/components/dashboard/MarketIntelContext";
import { ArrowUpDown, Globe } from "lucide-react";

type SortKey = "change1d" | "price" | "ticker";

const COLUMNS: { code: MarketCode; label: string; sub: string }[] = [
  { code: "NZX", label: "NZX", sub: "New Zealand" },
  { code: "ASX", label: "ASX", sub: "Australia" },
  { code: "US", label: "US", sub: "United States" },
];

function MarketColumn({ code, label, sub, rows }: { code: MarketCode; label: string; sub: string; rows: SecurityIntel[] }) {
  const [sort, setSort] = useState<SortKey>("change1d");

  const sorted = useMemo(() => {
    const list = [...rows];
    if (sort === "change1d") list.sort((a, b) => b.change1d - a.change1d);
    else if (sort === "price") list.sort((a, b) => b.price - a.price);
    else list.sort((a, b) => a.ticker.localeCompare(b.ticker));
    return list;
  }, [rows, sort]);

  const avg = rows.reduce((s, r) => s + r.change1d, 0) / (rows.length || 1);

  return (
    <div className="rounded-2xl border border-border/70 bg-card/40">
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-display text-base font-bold">{label}</span>
            <span
              className={cn(
                "tnum rounded px-1.5 py-0.5 text-[0.7rem] font-semibold",
                avg >= 0 ? "bg-emerald-500/12 text-emerald-400" : "bg-rose-500/12 text-rose-400"
              )}
            >
              {fmtPct(avg)}
            </span>
          </div>
          <p className="text-[0.7rem] text-muted-foreground">{sub}</p>
        </div>
        <button
          onClick={() => setSort((s) => (s === "change1d" ? "price" : s === "price" ? "ticker" : "change1d"))}
          className="flex items-center gap-1 rounded-md border border-border/60 px-2 py-1 text-[0.68rem] text-muted-foreground transition-colors hover:text-foreground"
          title="Change sort"
        >
          <ArrowUpDown className="size-3" />
          {sort === "change1d" ? "% 1D" : sort === "price" ? "Price" : "A-Z"}
        </button>
      </div>
      <div className="divide-y divide-border/40">
        {sorted.map((r) => {
          const up = r.change1d >= 0;
          return (
            <div key={r.ticker} className="flex items-center gap-2 px-4 py-2.5 transition-colors hover:bg-background/40">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="font-display text-sm font-semibold">{r.ticker.replace(/\.(NZ|AX)$/, "")}</span>
                  <SignalBadge signal={r.signal} />
                </div>
                <p className="truncate text-[0.68rem] text-muted-foreground">{r.name}</p>
              </div>
              <div className="text-right">
                <p className="tnum text-sm font-medium">{formatMarketPrice(r.price, r.currency)}</p>
                <p className={cn("tnum text-[0.72rem] font-semibold", pctClass(r.change1d))}>
                  {up ? "▲" : "▼"} {fmtPct(r.change1d)}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function MarketSnapshot() {
  const { universe, live } = useMarketIntel();
  const snapshot = useMemo(() => getMarketSnapshot(universe ?? undefined), [universe]);
  return (
    <section>
      <div className="mb-4 flex items-center gap-3">
        <span className="grid size-9 place-items-center rounded-lg bg-primary/12 text-primary">
          <Globe className="size-4" />
        </span>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h2 className="font-display text-lg font-bold">Market snapshot</h2>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider",
                live ? "bg-emerald-500/15 text-emerald-300" : "bg-muted text-muted-foreground"
              )}
            >
              {live ? "● Live" : "Simulated"}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">Cross-market intelligence · NZX · ASX · US</p>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {COLUMNS.map((c) => (
          <MarketColumn key={c.code} code={c.code} label={c.label} sub={c.sub} rows={snapshot[c.code]} />
        ))}
      </div>
    </section>
  );
}
