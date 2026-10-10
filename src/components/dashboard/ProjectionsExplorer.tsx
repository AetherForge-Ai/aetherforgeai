"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import {
  EXCHANGE_META,
  resolveExchange,
  formatMarketPrice,
  type SecurityIntel,
} from "@/lib/market-intel";
import { pctClass, fmtPct, ExchangeChip, publicMarketNote } from "@/components/dashboard/intel-ui";
import {
  CRYPTO_PROJECTIONS_PAUSE_MESSAGE,
  withoutCryptoProjections,
} from "@/lib/projection-pause";
import { modelRangeLine } from "@/lib/public-intel";
import { ENGINE_PARAGRAPH, HISTORY_LENGTH_LINE } from "@/lib/public-copy";
import { scoreBandSentence } from "@/lib/score-band";
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
  cryptoPaused?: boolean;
  cryptoPauseMessage?: string;
  combined: SecurityIntel[];
  stockUniverse: SecurityIntel[];
  cryptoUniverse: SecurityIntel[];
  scanned: { stocks: number; crypto: number };
}

type TabKey = "NZXASX" | "ALL" | "NZX" | "ASX" | "DOW" | "NASDAQ" | "CRYPTO";

interface TabDef {
  key: TabKey;
  label: string;
  sub: string;
}

const TABS: TabDef[] = [
  { key: "NZXASX", label: "NZX + ASX", sub: "Default" },
  { key: "ALL", label: "All Markets", sub: "Top 50 combined" },
  { key: "NZX", label: "NZX", sub: "New Zealand" },
  { key: "ASX", label: "ASX", sub: "Australia" },
  { key: "DOW", label: "Dow Jones", sub: "US blue-chip" },
  { key: "NASDAQ", label: "Nasdaq", sub: "US tech & growth" },
  { key: "CRYPTO", label: "Crypto", sub: "Paused" },
];

/** Readable market label for a security (NZX · ASX · Dow Jones · NASDAQ · Crypto). */
function marketLabelFor(s: SecurityIntel): string {
  if (s.market === "CRYPTO") return "Crypto";
  return EXCHANGE_META[resolveExchange(s.ticker, s.market)].label;
}

/** Confidence meter — a compact 0–100 agreement bar. */
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
            <p className="font-semibold text-foreground">Market data</p>
            <p>
              {HISTORY_LENGTH_LINE} Prices are requested for NZX, ASX, Dow and Nasdaq equities.
              Crypto projections are paused while a data issue is fixed. Live coin prices stay on
              Markets. Share rows appear when that feed answers. If it does not, the page says the
              engine failed.
            </p>
          </div>
          <div>
            <p className="font-semibold text-foreground">The 7-day projection</p>
            <p>
              {ENGINE_PARAGRAPH} The engine blends trend (SMA 20/50), momentum (RSI, MACD),
              mean-reversion (Bollinger position), realised volatility (ATR) and support/resistance
              structure into a 7-day range. The <span className="font-medium text-foreground">Projected</span>{" "}
              figure is the central point of that calculated range.
            </p>
          </div>
          <div>
            <p className="font-semibold text-foreground">Ranking &amp; confidence</p>
            <p>
              Every tab uses the same order: the projected 7-day percent times model confidence.
              The page opens on NZX and ASX. Crypto projections are paused. A score of 0–33 is weak,
              34–66 is moderate, and 67 or above is the top band.
            </p>
          </div>
          <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 text-xs text-amber-200/90">
            <p className="font-semibold text-amber-200">Not financial advice</p>
            <p className="mt-1">
              {ENGINE_PARAGRAPH} This is general information under the Financial Markets Conduct Act
              2013, not personalised financial advice.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ProjectionRow({ rank, s, showMarket = false }: { rank: number; s: SecurityIntel; showMarket?: boolean }) {
  const [open, setOpen] = useState(false);
  const colSpan = showMarket ? 8 : 7;
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
                <p className="text-sm leading-relaxed text-muted-foreground">{publicMarketNote(s.reasoning)}</p>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{scoreBandSentence(s.score)}</p>
                {modelRangeLine(s.outlook) ? (
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground/80">{modelRangeLine(s.outlook)}</p>
                ) : null}
              </div>
              <div className="grid grid-cols-3 gap-2 sm:w-64">
                {[
                  { k: "RSI", v: s.rsi.toFixed(0) },
                  { k: "MACD", v: s.macdSignal },
                  { k: "vs SMA20", v: fmtPct(s.vsSma20) },
                  { k: "+7d", v: fmtPct(s.projected7dPct) },
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
  const [rows, setRows] = useState<SecurityIntel[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pauseMessage, setPauseMessage] = useState(CRYPTO_PROJECTIONS_PAUSE_MESSAGE);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<TabKey>("NZXASX");
  const pageSize = 25;

  const load = useCallback(async (tab: TabKey, pageNum: number, isRefresh: boolean) => {
    if (tab === "CRYPTO") {
      setRows([]);
      setTotal(0);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    console.log(`[projections] Fetching ${tab} page ${pageNum}…`);
    try {
      const res = await api.get<ProjectionsPayload & { rows?: SecurityIntel[]; total?: number; page?: number }>(
        `/api/projections?exchange=${tab}&page=${pageNum}&limit=${pageSize}`,
        { signal: AbortSignal.timeout(25_000) },
      );
      if (!res.ok || !res.data) throw new Error(res.error?.toString() || "The projection engine failed to return rows.");
      const ranked = withoutCryptoProjections(res.data.rows || res.data.combined || []);
      if (ranked.length === 0) throw new Error("The projection engine failed to return rows.");
      setRows(ranked);
      setTotal(typeof res.data.total === "number" ? res.data.total : ranked.length);
      setPauseMessage(res.data.cryptoPauseMessage || CRYPTO_PROJECTIONS_PAUSE_MESSAGE);
      console.log(`[projections] Loaded ${ranked.length} rows for ${tab} (live: ${res.data.live}).`);
    } catch (err) {
      console.error("[projections] Load failed:", err);
      const message = err instanceof Error ? err.message : "The projection engine failed to return rows.";
      setError(/abort|timeout|failed/i.test(message) ? "The projection engine failed to return rows." : message);
      setRows([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load(active, page, false);
  }, [active, page, load]);

  const activeList = rows;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const showMarket = active === "ALL";

  return (
    <div className="space-y-6 py-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <TrendingUp className="size-3.5" />
            Next 7 days
          </div>
          <h1 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">
            Weekly Market <span className="text-gradient">Projections</span>
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            The table opens on NZX and ASX. Every tab uses the same order: projected 7-day percent
            times model confidence. Crypto projections stay paused.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <MethodologyModal />
          <Button
            variant="outline"
            size="sm"
            onClick={() => load(active, page, true)}
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
          const isActive = active === t.key;
          return (
            <button
              key={t.key}
              onClick={() => {
                setPage(1);
                setActive(t.key);
              }}
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
                {t.key === "CRYPTO" ? "Paused" : t.key === active && !loading ? `${total}` : t.sub === "Default" ? "NZ" : ""}
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
            <p className="text-sm">The projection table fills when the engine answers.</p>
          </div>
        </div>
      ) : error ? (
        <div className="grid place-items-center rounded-2xl border border-rose-500/30 bg-rose-500/5 py-16 text-center">
          <div className="max-w-sm space-y-3">
            <p className="text-sm text-rose-700">{error}</p>
            <Button variant="outline" size="sm" onClick={() => load(active, page, true)}>
              <RefreshCw className="size-4" /> Try again
            </Button>
          </div>
        </div>
      ) : active === "CRYPTO" ? (
        <div className="grid place-items-center rounded-2xl border border-border/60 bg-card/40 px-6 py-16 text-center">
          <p className="max-w-md text-sm leading-relaxed text-muted-foreground">{pauseMessage}</p>
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
          {pageCount > 1 ? (
            <div className="flex items-center justify-between gap-3 border-t border-border/60 px-4 py-3 text-sm">
              <button
                type="button"
                className="font-semibold text-primary disabled:opacity-40"
                disabled={page <= 1 || loading}
                onClick={() => setPage((n) => Math.max(1, n - 1))}
              >
                Previous
              </button>
              <span className="text-muted-foreground">
                Page {page} of {pageCount}
              </span>
              <button
                type="button"
                className="font-semibold text-primary disabled:opacity-40"
                disabled={page >= pageCount || loading}
                onClick={() => setPage((n) => n + 1)}
              >
                Next
              </button>
            </div>
          ) : null}
        </div>
      )}

      {/* Footnote */}
      <p className="text-center text-xs text-muted-foreground/80">
        {ENGINE_PARAGRAPH} This is general information, not personalised financial advice under the
        Financial Markets Conduct Act 2013. A failed load says so. Markets are uncertain.
      </p>
    </div>
  );
}
