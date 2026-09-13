"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { ArrowDown, ArrowUp, Loader2 } from "lucide-react";

type ExchangeKey = "NZX" | "ASX" | "NASDAQ" | "DOW";

type Props = {
  /** Display title on the card (e.g. NZSX) */
  title: string;
  exchange: ExchangeKey;
  className?: string;
};

type SnapshotMover = {
  ticker: string;
  symbol: string;
  name: string;
  price: number;
  changePct: number;
};

type ExchangeSnapshot = {
  exchange: string;
  label: string;
  index: {
    name: string;
    price: number | null;
    changePct: number | null;
    live: boolean;
  };
  breadth: { advancers: number; decliners: number; unchanged: number; total: number };
  topGainers: SnapshotMover[];
  topLosers: SnapshotMover[];
};

const idxFmt = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * One of the four index windows on the dashboard home grid.
 * Loads live headline index + breadth + a top mover from /api/market-snapshot.
 */
export function IndexMarketCard({ title, exchange, className }: Props) {
  const [snap, setSnap] = useState<ExchangeSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      const res = await api.get<{ asOf: string; exchanges: ExchangeSnapshot[] }>(
        "/api/market-snapshot"
      );
      if (!active) return;
      if (res.ok && res.data?.exchanges) {
        const found =
          res.data.exchanges.find((e) => e.exchange === exchange) ?? null;
        setSnap(found);
      }
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [exchange]);

  const idx = snap?.index;
  const up = (idx?.changePct ?? 0) >= 0;
  const gainer = snap?.topGainers?.[0];
  const loser = snap?.topLosers?.[0];

  return (
    <div
      className={cn(
        "flex min-h-[11.5rem] flex-col rounded-2xl border border-border/70 bg-card/70 p-4 shadow-sm",
        className
      )}
    >
      <h3 className="font-grift-black text-sm uppercase tracking-wide text-amber-400 sm:text-base">
        {title}
      </h3>

      {loading ? (
        <div className="mt-6 flex flex-1 items-center justify-center text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : !snap || idx?.price == null ? (
        <div className="mt-4 flex flex-1 flex-col justify-center">
          <p className="text-sm text-muted-foreground">Index feed unavailable</p>
          <p className="mt-1 text-xs text-muted-foreground/80">
            Retry with Refresh prices above.
          </p>
        </div>
      ) : (
        <div className="mt-3 flex flex-1 flex-col">
          <p className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
            {idx.name}
            {idx.live ? (
              <span className="ml-1.5 text-emerald-600">● Live</span>
            ) : null}
          </p>
          <p className="tnum mt-1 font-display text-2xl font-bold text-emerald-600">
            {idxFmt.format(idx.price)}
          </p>
          <p
            className={cn(
              "mt-0.5 flex items-center gap-1 text-sm font-semibold",
              up ? "text-emerald-600" : "text-rose-600"
            )}
          >
            {up ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />}
            {idx.changePct == null
              ? "—"
              : `${up ? "+" : ""}${idx.changePct.toFixed(2)}%`}
          </p>

          {snap.breadth ? (
            <p className="mt-3 text-[0.7rem] text-muted-foreground">
              Breadth{" "}
              <span className="font-medium text-emerald-700">
                {snap.breadth.advancers}↑
              </span>
              {" · "}
              <span className="font-medium text-rose-600">
                {snap.breadth.decliners}↓
              </span>
              {" · "}
              {snap.breadth.unchanged} flat
            </p>
          ) : null}

          <div className="mt-auto grid grid-cols-2 gap-2 pt-3 text-[0.68rem]">
            {gainer ? (
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-2 py-1.5">
                <p className="font-bold text-primary">{gainer.symbol}</p>
                <p className="text-emerald-600">
                  +{gainer.changePct.toFixed(2)}%
                </p>
              </div>
            ) : null}
            {loser ? (
              <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 px-2 py-1.5">
                <p className="font-bold text-primary">{loser.symbol}</p>
                <p className="text-rose-600">{loser.changePct.toFixed(2)}%</p>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

export default IndexMarketCard;
