"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { formatMarketPrice, type Exchange } from "@/lib/market-intel";
import {
  StockDetailDialog,
  type DetailTarget,
} from "@/components/dashboard/StockDetailDialog";
import { cn } from "@/lib/utils";
import {
  Activity,
  ArrowDown,
  ArrowUp,
  Gauge,
  Loader2,
  RefreshCw,
  TrendingUp,
} from "lucide-react";

/* ---- Shapes mirror /api/market-snapshot ---------------------------------- */
interface SnapshotMover {
  ticker: string;
  symbol: string;
  name: string;
  price: number;
  changePct: number;
  changeAbs: number;
}
interface ExchangeSnapshot {
  exchange: Exchange;
  label: string;
  sub: string;
  currency: "NZD" | "AUD" | "USD";
  index: {
    name: string;
    price: number | null;
    changePct: number | null;
    changeAbs: number | null;
    live: boolean;
  };
  breadth: { advancers: number; decliners: number; unchanged: number; total: number };
  avgChangePct: number;
  topGainers: SnapshotMover[];
  topLosers: SnapshotMover[];
  liveCount: number;
}
interface SnapshotPayload {
  asOf: string;
  exchanges: ExchangeSnapshot[];
}

const idxNumFmt = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function pctClass(v: number | null | undefined) {
  if (v == null) return "text-muted-foreground";
  return v >= 0 ? "text-emerald-600" : "text-rose-600";
}

/** A compact clickable mover row inside a gainers/losers list. */
function MoverRow({
  m,
  exchange,
  currency,
  onOpen,
}: {
  m: SnapshotMover;
  exchange: Exchange;
  currency: "NZD" | "AUD" | "USD";
  onOpen: (t: DetailTarget) => void;
}) {
  const up = m.changePct >= 0;
  return (
    <button
      onClick={() =>
        onOpen({
          symbol: m.symbol,
          ticker: m.ticker,
          name: m.name,
          exchange,
          currency,
        })
      }
      className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-primary/8"
    >
      <div className="min-w-0">
        <span className="text-xs font-bold text-primary">{m.symbol}</span>
        <p className="truncate text-[0.66rem] text-muted-foreground">{m.name}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="tnum text-xs font-semibold">{formatMarketPrice(m.price, currency)}</p>
        <p className={cn("tnum flex items-center justify-end gap-0.5 text-[0.66rem] font-semibold", pctClass(m.changePct))}>
          {up ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
          {Math.abs(m.changePct).toFixed(2)}%
        </p>
      </div>
    </button>
  );
}

/** One exchange overview card. */
function ExchangeCard({
  s,
  onOpen,
}: {
  s: ExchangeSnapshot;
  onOpen: (t: DetailTarget) => void;
}) {
  const idxUp = (s.index.changePct ?? 0) >= 0;
  const breadthTotal = Math.max(1, s.breadth.advancers + s.breadth.decliners + s.breadth.unchanged);
  const advPct = (s.breadth.advancers / breadthTotal) * 100;
  const decPct = (s.breadth.decliners / breadthTotal) * 100;

  return (
    <div className="flex flex-col rounded-2xl border border-border/60 bg-background/40 p-4">
      {/* Header: exchange + index */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-base font-bold">{s.label}</h3>
          <p className="truncate text-[0.66rem] text-muted-foreground">{s.index.name}</p>
        </div>
        <div className="shrink-0 text-right">
          {s.index.live && s.index.price != null ? (
            <>
              <p className="tnum text-sm font-bold">{idxNumFmt.format(s.index.price)}</p>
              <p className={cn("tnum flex items-center justify-end gap-0.5 text-xs font-semibold", pctClass(s.index.changePct))}>
                {idxUp ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
                {s.index.changeAbs != null && (
                  <>{idxUp ? "+" : "−"}{idxNumFmt.format(Math.abs(s.index.changeAbs))} · </>
                )}
                {Math.abs(s.index.changePct ?? 0).toFixed(2)}%
              </p>
            </>
          ) : (
            <span className="text-[0.66rem] text-muted-foreground">Index closed</span>
          )}
        </div>
      </div>

      {/* Breadth bar */}
      <div className="mt-3">
        <div className="flex items-center justify-between text-[0.62rem] text-muted-foreground">
          <span className="flex items-center gap-1">
            <Gauge className="size-3" /> Breadth
          </span>
          <span>
            avg{" "}
            <span className={cn("font-semibold", pctClass(s.avgChangePct))}>
              {s.avgChangePct >= 0 ? "+" : ""}
              {s.avgChangePct.toFixed(2)}%
            </span>
          </span>
        </div>
        <div className="mt-1 flex h-2 overflow-hidden rounded-full bg-muted/40">
          <div className="h-full bg-emerald-500/70" style={{ width: `${advPct}%` }} />
          <div className="h-full bg-rose-500/70" style={{ width: `${decPct}%` }} />
        </div>
        <div className="mt-1 flex justify-between text-[0.6rem] text-muted-foreground">
          <span className="text-emerald-600">{s.breadth.advancers} up</span>
          <span className="text-rose-600">{s.breadth.decliners} down</span>
        </div>
      </div>

      {/* Movers */}
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <p className="mb-1 flex items-center gap-1 text-[0.6rem] font-bold uppercase tracking-wide text-emerald-600">
            <TrendingUp className="size-3" /> Top gainers
          </p>
          <div className="space-y-0.5">
            {s.topGainers.length ? (
              s.topGainers.map((m) => (
                <MoverRow key={m.ticker} m={m} exchange={s.exchange} currency={s.currency} onOpen={onOpen} />
              ))
            ) : (
              <p className="px-2 py-1 text-[0.66rem] text-muted-foreground">No live movers</p>
            )}
          </div>
        </div>
        <div>
          <p className="mb-1 flex items-center gap-1 text-[0.6rem] font-bold uppercase tracking-wide text-rose-600">
            <ArrowDown className="size-3" /> Top losers
          </p>
          <div className="space-y-0.5">
            {s.topLosers.length ? (
              s.topLosers.map((m) => (
                <MoverRow key={m.ticker} m={m} exchange={s.exchange} currency={s.currency} onOpen={onOpen} />
              ))
            ) : (
              <p className="px-2 py-1 text-[0.66rem] text-muted-foreground">No live movers</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * "OPEN MARKET SNAPSHOT" — a prominent dashboard card that opens a modal with a
 * quick, live cross-market overview (index performance, breadth, top movers) for
 * NZX · ASX · Dow Jones · NASDAQ. Every ticker is clickable → detailed view.
 * Mirrors the ALL Markets card styling so the two CTAs sit together naturally.
 */
export function OpenMarketSnapshot({ onBought }: { onBought?: () => void }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<SnapshotPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailTarget, setDetailTarget] = useState<DetailTarget | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    console.log("[market-snapshot] Loading cross-market overview");
    const res = await api.get<SnapshotPayload>(`/api/market-snapshot?t=${Date.now()}`);
    if (res.ok && res.data) {
      setData(res.data);
    } else {
      console.error("[market-snapshot] Load failed:", res.error);
      if (!silent) setError("Live snapshot is unavailable right now. Please try again.");
    }
    setLoading(false);
  }, []);

  // Load on open + refresh silently every 45s while open.
  useEffect(() => {
    if (!open) return;
    load();
    const id = setInterval(() => {
      if (!document.hidden) load(true);
    }, 45_000);
    return () => clearInterval(id);
  }, [open, load]);

  function openDetail(t: DetailTarget) {
    setDetailTarget(t);
    setDetailOpen(true);
  }

  const asOf = data?.asOf ? new Date(data.asOf) : null;

  return (
    <section>
      {/* Prominent dashboard card — opens the market overview */}
      <button
        onClick={() => setOpen(true)}
        className="group flex w-full items-center gap-4 rounded-3xl border border-primary/30 bg-gradient-to-br from-emerald-500/10 via-card/60 to-card/50 p-6 text-left shadow-glow transition-colors hover:border-primary/50"
      >
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-emerald-500/15 text-emerald-600">
          <Activity className="size-6" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="font-display text-lg font-bold">Open Market Snapshot</h2>
            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider text-emerald-700">
              ● Live
            </span>
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            A quick pulse of all four markets — index performance, breadth &amp; today&apos;s top movers.
          </p>
        </div>
        <span className="hidden shrink-0 items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-transform group-hover:scale-[1.03] sm:inline-flex">
          <TrendingUp className="size-4" /> View Snapshot
        </span>
      </button>

      {/* Snapshot modal */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[92vh] w-[96vw] max-w-5xl flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="flex-row items-start justify-between gap-3 border-b border-border/60 px-5 py-4 sm:px-6">
            <div>
              <DialogTitle className="flex items-center gap-2 font-display text-xl">
                <Activity className="size-5 text-emerald-600" /> Open Market Snapshot
              </DialogTitle>
              <DialogDescription>
                Live overview of NZX · ASX · Dow Jones · NASDAQ. Click any ticker for the full view.
              </DialogDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => load()}
              disabled={loading}
              className="mt-1 shrink-0 gap-1.5"
            >
              <RefreshCw className={cn("size-3.5", loading && "animate-spin")} /> Refresh
            </Button>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">
            {loading && !data ? (
              <div className="flex h-64 items-center justify-center text-muted-foreground">
                <Loader2 className="mr-2 size-5 animate-spin" /> Loading live snapshot…
              </div>
            ) : error && !data ? (
              <div className="flex h-64 flex-col items-center justify-center gap-3 text-center text-sm text-muted-foreground">
                {error}
                <Button variant="outline" size="sm" onClick={() => load()}>
                  Try again
                </Button>
              </div>
            ) : data ? (
              <>
                <div className="grid gap-4 md:grid-cols-2">
                  {data.exchanges.map((s) => (
                    <ExchangeCard key={s.exchange} s={s} onOpen={openDetail} />
                  ))}
                </div>
                {asOf && (
                  <p className="mt-4 text-center text-[0.62rem] text-muted-foreground">
                    Live via Yahoo Finance · as of{" "}
                    {asOf.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · NZX
                    quotes may be delayed ~20 min · auto-refreshes every 45s
                  </p>
                )}
              </>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      {/* Detailed stock view reused from the markets explorer */}
      <StockDetailDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        target={detailTarget}
        canBuy={!!onBought}
        onBought={onBought}
      />
    </section>
  );
}
