"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import {
  EXCHANGES,
  EXCHANGE_META,
  resolveExchange,
  getProjectionLeaders,
  formatMarketPrice,
  type SecurityIntel,
} from "@/lib/market-intel";
import { pctClass, fmtPct, SignalBadge, ExchangeChip } from "@/components/dashboard/intel-ui";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  TrendingUp,
  RefreshCw,
  Info,
  Loader2,
  Gauge,
  Sparkles,
  ChevronRight,
} from "lucide-react";

interface ProjectionsPayload {
  live: boolean;
  combined: SecurityIntel[];
  stockUniverse: SecurityIntel[];
  cryptoUniverse: SecurityIntel[];
  scanned: { stocks: number; crypto: number };
}

type TabKey = "ALL" | "NZX" | "ASX" | "DOW" | "NASDAQ" | "CRYPTO";

interface TabDef {
  key: TabKey;
  label: string;
  sub: string;
}

const TABS: TabDef[] = [
  { key: "ALL", label: "All Markets", sub: "Top 50 combined" },
  { key: "NZX", label: "NZX", sub: "New Zealand" },
  { key: "ASX", label: "ASX", sub: "Australia" },
  { key: "DOW", label: "Dow Jones", sub: "US blue-chip" },
  { key: "NASDAQ", label: "Nasdaq", sub: "US tech & growth" },
  { key: "CRYPTO", label: "Crypto", sub: "Entire crypto market" },
];

/** Readable market label for a security (NZX · ASX · Dow Jones · NASDAQ · Crypto). */
function marketLabelFor(s: SecurityIntel): string {
  if (s.market === "CRYPTO") return "Crypto";
  return EXCHANGE_META[resolveExchange(s.ticker, s.market)].label;
}

/** Confidence meter — a compact 0–100 conviction bar. */
function Confidence({ value }: { value: number }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  const tone =
    v >= 70 ? "bg-emerald-400" : v >= 45 ? "bg-amber-400" : "bg-rose-400";
  return (
    <div className="flex items-center gap-2" title={`${v}% model confidence`}>
      <div className="h-1.5 w-14 overflow-hidden rounded-full bg-muted/50">
        <div className={cn("h-full rounded-full", tone)} style={{ width: `${v}%` }} />
      </div>
      <span className="tnum text-xs text-muted-foreground">{v}%</span>
    </div>
  );
}

function MethodologyModal() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Info className="size-4" /> Methodology
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gauge className="size-5 text-primary" /> How these projections are built
          </DialogTitle>
          <DialogDescription>
            A transparent look at the data and model behind the weekly outlook.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 text-sm leading-relaxed text-muted-foreground">
          <div>
            <p className="font-semibold text-foreground">Live market data</p>
            <p>
              Prices and 30-day histories are pulled live for every security — Twelve Data &amp;
              Yahoo Finance for NZX · ASX · Dow · Nasdaq equities, and CoinGecko for crypto. The
              model re-runs on this real price action, not static samples.
            </p>
          </div>
          <div>
            <p className="font-semibold text-foreground">The 7-day projection</p>
            <p>
              Each name is scored by a deterministic technical-analysis engine that blends trend
              (SMA 20/50), momentum (RSI, MACD), mean-reversion (Bollinger position), realised
              volatility (ATR) and support/resistance structure into a probabilistic 7-day outlook.
              The <span className="font-medium text-foreground">Projected</span> figure is the
              central expected move over the next five trading sessions.
            </p>
          </div>
          <div>
            <p className="font-semibold text-foreground">Ranking &amp; confidence</p>
            <p>
              The <span className="font-medium text-foreground">All Markets</span> view scans every
              market — NASDAQ, Dow Jones, NZX, ASX and the entire crypto market — and ranks the Top 50
              strictly by projected 7-day % increase, highest to lowest, each labelled by its market.
              Each single-market tab is ordered by the conviction-weighted projected move (projection ×
              model confidence). Confidence reflects how strongly the indicators agree.
            </p>
          </div>
          <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 text-xs text-amber-200/90">
            <p className="font-semibold text-amber-200">Not financial advice</p>
            <p className="mt-1">
              Projections are AI-generated general information under the Financial Markets Conduct
              Act 2013 — not personalised financial advice. Markets are uncertain; always do your
              own research and consult a licensed adviser before investing.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ProjectionRow({ rank, s, showMarket = false }: { rank: number; s: SecurityIntel; showMarket?: boolean }) {
  const [open, setOpen] = useState(false);
  const colSpan = showMarket ? 9 : 8;
  return (
    <>
      <tr className="group border-b border-border/40 transition-colors hover:bg-card/50">
        <td className="py-3 pl-3 pr-2 text-center">
          <span
            className={cn(
              "tnum inline-grid size-7 place-items-center rounded-lg text-xs font-bold",
              rank <= 3
                ? "bg-primary/15 text-primary ring-1 ring-primary/25"
                : "bg-muted/40 text-muted-foreground"
            )}
          >
            {rank}
          </span>
        </td>
        <td className="px-2 py-3">
          <div className="flex items-center gap-2">
            <ExchangeChip ticker={s.ticker} market={s.market} />
            <span className="font-display text-sm font-bold tracking-tight">{s.ticker}</span>
          </div>
        </td>
        {showMarket && (
          <td className="px-2 py-3">
            <span className="whitespace-nowrap rounded-md border border-border/60 bg-muted/30 px-2 py-0.5 text-[11px] font-semibold text-foreground/80">
              {marketLabelFor(s)}
            </span>
          </td>
        )}
        <td className="hidden max-w-[220px] px-2 py-3 sm:table-cell">
          <span className="block truncate text-sm text-muted-foreground">{s.name}</span>
        </td>
        <td className="px-2 py-3 text-right">
          <span className="tnum text-sm font-medium">{formatMarketPrice(s.price, s.currency)}</span>
        </td>
        <td className="px-2 py-3 text-right">
          <span className={cn("tnum text-sm font-bold", pctClass(s.projected7dPct))}>
            {fmtPct(s.projected7dPct)}
          </span>
        </td>
        <td className="hidden px-2 py-3 md:table-cell">
          <Confidence value={s.confidence} />
        </td>
        <td className="hidden px-2 py-3 lg:table-cell">
          <SignalBadge signal={s.signal} />
        </td>
        <td className="px-2 py-3 pr-3 text-right">
          <button
            onClick={() => setOpen((o) => !o)}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
            aria-expanded={open}
          >
            <span className="hidden sm:inline">Analysis</span>
            <ChevronRight className={cn("size-4 transition-transform", open && "rotate-90")} />
          </button>
        </td>
      </tr>
      {open && (
        <tr className="border-b border-border/40 bg-card/30">
          <td colSpan={colSpan} className="px-4 py-4">
            <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
              <div>
                <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-primary">
                  <Sparkles className="size-3.5" /> Reasoning &amp; analysis
                </p>
                <p className="text-sm leading-relaxed text-muted-foreground">{s.reasoning}</p>
                <p className="mt-2 text-xs text-muted-foreground/80">
                  <span className="font-medium text-foreground/80">Conviction:</span>{" "}
                  {s.conviction} — {s.convictionReason}
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2 sm:w-64">
                {[
                  { k: "RSI", v: s.rsi.toFixed(0) },
                  { k: "MACD", v: s.macdSignal },
                  { k: "vs SMA20", v: fmtPct(s.vsSma20) },
                  { k: "7d", v: fmtPct(s.change7d) },
                  { k: "30d", v: fmtPct(s.change30d) },
                  { k: "Score", v: s.score.toFixed(0) },
                ].map((m) => (
                  <div
                    key={m.k}
                    className="rounded-lg border border-border/50 bg-background/40 px-2 py-1.5 text-center"
                  >
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{m.k}</p>
                    <p className="tnum mt-0.5 text-xs font-semibold">{m.v}</p>
                  </div>
                ))}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export function ProjectionsExplorer() {
  const [stockUniverse, setStockUniverse] = useState<SecurityIntel[]>([]);
  const [cryptoUniverse, setCryptoUniverse] = useState<SecurityIntel[]>([]);
  const [combined, setCombined] = useState<SecurityIntel[]>([]);
  const [live, setLive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<TabKey>("ALL");

  const load = useCallback(async (isRefresh: boolean) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    console.log("[projections] Fetching combined all-markets sweep…");
    try {
      const res = await api.get<ProjectionsPayload>("/api/projections");
      if (!res.ok || !res.data) throw new Error(res.error?.toString() || "Failed to load projections");
      setStockUniverse(res.data.stockUniverse || []);
      setCryptoUniverse(res.data.cryptoUniverse || []);
      setCombined(res.data.combined || []);
      setLive(!!res.data.live);
      console.log(
        `[projections] Loaded ${res.data.scanned?.stocks || 0} equities + ${res.data.scanned?.crypto || 0} crypto ` +
          `→ ${res.data.combined?.length || 0} combined (live: ${res.data.live})`
      );
    } catch (err) {
      console.error("[projections] Load failed:", err);
      setError(err instanceof Error ? err.message : "Could not load projections. Please try again.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load(false);
  }, [load]);

  // Pre-compute each tab's list. "All Markets" is the server-ranked Top 50 across
  // every market combined (strictly highest → lowest projected %); each exchange
  // tab is its own conviction-weighted Top 50; Crypto spans the ENTIRE market.
  const listsByTab = useMemo(() => {
    const out: Record<TabKey, SecurityIntel[]> = {
      ALL: combined,
      NZX: [],
      ASX: [],
      DOW: [],
      NASDAQ: [],
      CRYPTO: [],
    };
    for (const ex of EXCHANGES) {
      const forEx = stockUniverse.filter((s) => resolveExchange(s.ticker, s.market) === ex);
      out[ex as TabKey] = getProjectionLeaders(50, forEx);
    }
    out.CRYPTO = getProjectionLeaders(50, cryptoUniverse);
    return out;
  }, [combined, stockUniverse, cryptoUniverse]);

  const activeList = listsByTab[active];
  const showMarket = active === "ALL";

  return (
    <div className="space-y-6 py-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <TrendingUp className="size-3.5" />
            Next 7 days
            {live && (
              <span className="ml-1 inline-flex items-center gap-1 text-emerald-600">
                <span className="relative flex size-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400" />
                  <span className="relative inline-flex size-1.5 rounded-full bg-emerald-400" />
                </span>
                Live data
              </span>
            )}
          </div>
          <h1 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">
            Weekly Market <span className="text-gradient">Projections</span>
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">All Markets</span> ranks the Top 50 highest
            projected 7-day movers across <span className="font-medium text-foreground">every market
            combined</span> — NASDAQ, Dow Jones, NZX, ASX and the entire crypto market — sorted strictly
            highest to lowest and labelled by market. Switch tabs for a single market&apos;s Top 50.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <MethodologyModal />
          <Button
            variant="outline"
            size="sm"
            onClick={() => load(true)}
            disabled={refreshing || loading}
            className="gap-1.5"
          >
            <RefreshCw className={cn("size-4", refreshing && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => {
          const count = listsByTab[t.key].length;
          const isActive = active === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setActive(t.key)}
              className={cn(
                "group flex items-center gap-2 rounded-xl border px-3.5 py-2 text-left transition-all",
                isActive
                  ? "border-primary/40 bg-primary/12 shadow-glow"
                  : "border-border/60 bg-card/40 hover:border-primary/30 hover:bg-card/70"
              )}
            >
              <div>
                <p className={cn("text-sm font-bold tracking-tight", isActive ? "text-primary" : "text-foreground")}>
                  {t.label}
                </p>
                <p className="text-[11px] text-muted-foreground">{t.sub}</p>
              </div>
              <span
                className={cn(
                  "tnum rounded-md px-1.5 py-0.5 text-[11px] font-bold",
                  isActive ? "bg-primary/20 text-primary" : "bg-muted/50 text-muted-foreground"
                )}
              >
                {loading ? "··" : `Top ${count}`}
              </span>
            </button>
          );
        })}
      </div>

      {/* Body */}
      {loading ? (
        <div className="grid place-items-center rounded-2xl border border-border/60 bg-card/40 py-24">
          <div className="flex flex-col items-center gap-3 text-muted-foreground">
            <Loader2 className="size-7 animate-spin text-primary" />
            <p className="text-sm">Running the projection engine on live market data…</p>
          </div>
        </div>
      ) : error ? (
        <div className="grid place-items-center rounded-2xl border border-rose-500/30 bg-rose-500/5 py-16 text-center">
          <div className="max-w-sm space-y-3">
            <p className="text-sm text-rose-700">{error}</p>
            <Button variant="outline" size="sm" onClick={() => load(true)}>
              <RefreshCw className="size-4" /> Try again
            </Button>
          </div>
        </div>
      ) : activeList.length === 0 ? (
        <div className="grid place-items-center rounded-2xl border border-border/60 bg-card/40 py-16 text-center text-sm text-muted-foreground">
          No projections available for this market right now. Try refreshing in a moment.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/40">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse">
              <thead>
                <tr className="border-b border-border/60 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="py-2.5 pl-3 pr-2 text-center font-semibold">Rank</th>
                  <th className="px-2 py-2.5 font-semibold">Ticker</th>
                  {showMarket && <th className="px-2 py-2.5 font-semibold">Market</th>}
                  <th className="hidden px-2 py-2.5 font-semibold sm:table-cell">Name</th>
                  <th className="px-2 py-2.5 text-right font-semibold">Price</th>
                  <th className="px-2 py-2.5 text-right font-semibold">Projected 7d</th>
                  <th className="hidden px-2 py-2.5 font-semibold md:table-cell">Confidence</th>
                  <th className="hidden px-2 py-2.5 font-semibold lg:table-cell">Signal</th>
                  <th className="px-2 py-2.5 pr-3 text-right font-semibold">Detail</th>
                </tr>
              </thead>
              <tbody>
                {activeList.map((s, i) => (
                  <ProjectionRow key={`${s.market}-${s.ticker}`} rank={i + 1} s={s} showMarket={showMarket} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Footnote */}
      <p className="text-center text-xs text-muted-foreground/80">
        Projections are AI-generated general information — not personalised financial advice under
        the Financial Markets Conduct Act 2013. Data updates live; markets are uncertain.
      </p>
    </div>
  );
}
