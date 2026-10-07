"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { presentNzsxBoard, type NzsxBoardView } from "@/lib/nzsx-board";
import { cn } from "@/lib/utils";

const levelFmt = new Intl.NumberFormat("en-NZ", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function signed(pct: number): string {
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`;
}

function MoverList({
  title,
  rows,
  tone,
}: {
  title: string;
  rows: NzsxBoardView["gainers"];
  tone: "up" | "down";
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold">{title}</h3>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">No movers in this snapshot.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {rows.map((row) => (
            <li key={`${title}-${row.symbol}`} className="flex items-baseline justify-between gap-3 text-sm">
              <span>
                <span className="font-semibold">{row.symbol}</span>
                <span className="ml-2 text-muted-foreground">{row.name}</span>
              </span>
              <span className={cn("tnum font-semibold", tone === "up" ? "text-emerald-600" : "text-rose-600")}>
                {signed(row.changePct)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Index level, breadth and movers for /dashboard/markets/nzsx. */
export function NzsxMarketBoard() {
  const [board, setBoard] = useState<NzsxBoardView | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      const res = await api.get("/api/market-snapshot");
      if (!active) return;
      setBoard(presentNzsxBoard(res));
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  const view = board;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <p className="text-sm text-muted-foreground">
        <Link href="/dashboard" className="font-semibold text-primary hover:underline">
          Back to Dashboard
        </Link>
      </p>
      <h1 className="mt-3 font-display text-3xl font-bold">NZSX</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        S&amp;P/NZX 50 level, breadth and top movers.
      </p>

      {loading || !view ? (
        <div className="mt-8 space-y-3" aria-hidden>
          <div className="h-4 w-48 animate-pulse rounded bg-muted/50" />
          <div className="h-10 w-40 animate-pulse rounded bg-muted/50" />
          <div className="h-24 animate-pulse rounded-xl bg-muted/40" />
        </div>
      ) : (
        <div className="mt-8 space-y-8">
          <p data-testid="nzsx-freshness" className="text-sm leading-relaxed text-muted-foreground">
            <span className="font-semibold text-foreground">Freshness. </span>
            {view.freshness}
          </p>

          <section>
            <h2 className="font-display text-lg font-bold">Index</h2>
            <p className="mt-1 text-sm text-muted-foreground">{view.indexName}</p>
            {view.level == null ? (
              <p className="mt-2 text-sm text-muted-foreground">The index level is not available right now.</p>
            ) : (
              <>
                <p className="tnum mt-2 font-display text-3xl font-bold">{levelFmt.format(view.level)}</p>
                {view.changePct != null ? (
                  <p className={cn("mt-1 text-sm font-semibold", view.changePct >= 0 ? "text-emerald-600" : "text-rose-600")}>
                    {signed(view.changePct)}
                  </p>
                ) : null}
              </>
            )}
          </section>

          <section>
            <h2 className="font-display text-lg font-bold">Breadth</h2>
            <p className="mt-1 text-sm text-muted-foreground">{view.universeNote}</p>
            {view.breadth ? (
              <p className="mt-2 text-sm">
                <span className="font-semibold text-emerald-700">{view.breadth.advancers} up</span>
                {" · "}
                <span className="font-semibold text-rose-600">{view.breadth.decliners} down</span>
                {" · "}
                {view.breadth.unchanged} flat · {view.breadth.total} names
              </p>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">Breadth is not available right now.</p>
            )}
          </section>

          <section>
            <h2 className="font-display text-lg font-bold">Top movers</h2>
            <div className="mt-3 grid gap-6 sm:grid-cols-2">
              <MoverList title="Gainers" rows={view.gainers} tone="up" />
              <MoverList title="Losers" rows={view.losers} tone="down" />
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
