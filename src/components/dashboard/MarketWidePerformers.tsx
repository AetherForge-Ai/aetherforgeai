"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import {
  getTopPerformers,
  resolveExchange,
  EXCHANGE_META,
  EXCHANGES,
  type SecurityIntel,
  type Exchange,
} from "@/lib/market-intel";
import { pctClass, fmtPct } from "@/components/dashboard/intel-ui";
import {
  StockDetailDialog,
  type DetailTarget,
} from "@/components/dashboard/StockDetailDialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Rocket,
  RefreshCw,
  Loader2,
  ArrowUp,
  ArrowDown,
  Info,
  ChevronDown,
  Sparkles,
  Gauge,
} from "lucide-react";

/**
 * Projected Top Performers — an AI-generated, MARKET-WIDE projection surface.
 *
 * Presented as a collapsible section with FOUR exchange sub-tabs
 * (NZX · ASX · NASDAQ · Dow Jones). Each tab lists the Top 20 predicted
 * performers on that exchange in a rich table: Rank, Ticker (clickable →
 * detailed view), Company, Predicted performance (% upside), Confidence and a
 * short "key reasons" AI summary.
 *
 * DATA SOURCE (live — keyless, server-side):
 *   • GET /api/market?bot=stock → Yahoo Finance daily closes & quotes, analysed
 *     into SecurityIntel[]. Ranking/projection lives in src/lib/market-intel.ts
 *     (getTopPerformers → conviction-weighted 7-day upside blended with momentum,
 *     surfaced through the Stox/Koins quant engine).
 * US securities are bucketed into Dow Jones vs NASDAQ via resolveExchange().
 */

const TAB_ORDER: Exchange[] = ["NZX", "ASX", "NASDAQ", "DOW"];

export function MarketWidePerformers({ onBought }: { onBought?: () => void }) {
  const [universe, setUniverse] = useState<SecurityIntel[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [tab, setTab] = useState<Exchange>("NZX");
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [detailTarget, setDetailTarget] = useState<DetailTarget | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const load = useCallback(async (manual: boolean) => {
    if (manual) setRefreshing(true);
    else setLoading(true);
    console.log("[market-wide] Scanning NZX + ASX + NASDAQ + Dow projections…");
    const ts = Date.now();
    const stockRes = await api.get<{ universe: SecurityIntel[] }>(`/api/market?bot=stock&t=${ts}`);
    if (stockRes.ok && stockRes.data && stockRes.data.universe.length > 0) {
      setUniverse(stockRes.data.universe);
      setLastUpdated(new Date().toISOString());
      console.log(`[market-wide] Analysed ${stockRes.data.universe.length} securities across exchanges`);
    } else {
      console.error("[market-wide] No market data returned", stockRes.error);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    load(false);
  }, [load]);

  // Top 20 projected performers on the active exchange.
  const leaders = useMemo(() => {
    const pool = universe.filter((s) => resolveExchange(s.ticker, s.market) === tab);
    return getTopPerformers(20, pool);
  }, [universe, tab]);

  // Per-exchange counts for the tab labels.
  const counts = useMemo(() => {
    const c: Record<Exchange, number> = { NZX: 0, ASX: 0, DOW: 0, NASDAQ: 0 };
    for (const s of universe) c[resolveExchange(s.ticker, s.market)] += 1;
    return c;
  }, [universe]);

  function openDetail(s: SecurityIntel) {
    const exchange = resolveExchange(s.ticker, s.market);
    setDetailTarget({
      symbol: s.ticker.replace(/\.(NZ|AX|L)$/i, ""),
      ticker: s.ticker,
      name: s.name,
      exchange,
      currency: s.currency,
    });
    setDetailOpen(true);
  }

  const updated = lastUpdated
    ? new Date(lastUpdated).toLocaleTimeString("en-NZ", { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <section className="rounded-3xl border border-border/70 bg-card/50 p-6">
      {/* Header — click to collapse/expand the whole section */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex flex-1 items-center gap-3 text-left"
          aria-expanded={expanded}
        >
          <span className="grid size-9 place-items-center rounded-lg bg-primary/12 text-primary">
            <Rocket className="size-4" />
          </span>
          <div>
            <h2 className="flex items-center gap-2 font-display text-lg font-bold">
              Projected top performers
              <span className="flex items-center gap-1 rounded-full bg-primary/12 px-2 py-0.5 text-[0.58rem] font-bold uppercase tracking-wider text-primary">
                <Sparkles className="size-3" /> AI-generated
              </span>
            </h2>
            <p className="text-xs text-muted-foreground">
              Top 20 predicted movers per exchange · NZX · ASX · NASDAQ · Dow Jones
              {universe.length ? ` · ${universe.length} securities analysed` : ""}
            </p>
          </div>
          <ChevronDown
            className={cn(
              "ml-1 size-5 shrink-0 text-muted-foreground transition-transform",
              expanded && "rotate-180"
            )}
          />
        </button>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 px-3 text-xs"
          onClick={(e) => {
            e.stopPropagation();
            load(true);
          }}
          disabled={refreshing || loading}
        >
          {refreshing ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
          Refresh
        </Button>
      </div>

      {expanded && (
        <>
          {/* Exchange sub-tabs */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {TAB_ORDER.map((ex) => {
              const active = tab === ex;
              return (
                <button
                  key={ex}
                  onClick={() => setTab(ex)}
                  className={cn(
                    "rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors",
                    active
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border/60 bg-background/40 text-muted-foreground hover:text-foreground"
                  )}
                >
                  {EXCHANGE_META[ex].label}
                  {counts[ex] ? (
                    <span className="ml-1.5 text-[0.6rem] opacity-70">{counts[ex]}</span>
                  ) : null}
                </button>
              );
            })}
            {updated && <span className="ml-auto text-[0.6rem] text-muted-foreground">Updated {updated}</span>}
          </div>

          {/* Top-20 table for the active exchange */}
          <div className="mt-4 overflow-hidden rounded-2xl border border-border/60">
            {loading ? (
              <div className="space-y-px">
                {[...Array(8)].map((_, i) => (
                  <div key={i} className="h-11 animate-pulse bg-muted/30" />
                ))}
              </div>
            ) : leaders.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                No projected movers available for {EXCHANGE_META[tab].label} right now.
              </div>
            ) : (
              <div className="max-h-[32rem] overflow-y-auto">
                <table className="w-full border-collapse text-sm">
                  <thead className="sticky top-0 z-10 bg-card/95 backdrop-blur">
                    <tr className="border-b border-border/60 text-left text-[0.62rem] uppercase tracking-wide text-muted-foreground">
                      <th className="w-10 px-3 py-2 text-center">#</th>
                      <th className="px-3 py-2">Ticker</th>
                      <th className="hidden px-3 py-2 sm:table-cell">Company</th>
                      <th className="px-3 py-2 text-right">Projected</th>
                      <th className="px-3 py-2 text-right">Confidence</th>
                      <th className="hidden px-3 py-2 lg:table-cell">Key reasons</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaders.map((s, i) => {
                      const up = s.projected7dPct >= 0;
                      return (
                        <tr
                          key={s.ticker}
                          className="border-b border-border/40 transition-colors last:border-0 hover:bg-primary/5"
                        >
                          <td className="px-3 py-2.5 text-center">
                            <span className="tnum grid size-6 place-items-center rounded-md bg-primary/12 text-[0.62rem] font-bold text-primary">
                              {i + 1}
                            </span>
                          </td>
                          <td className="px-3 py-2.5">
                            <button
                              onClick={() => openDetail(s)}
                              className="font-display text-sm font-bold text-primary hover:underline"
                            >
                              {s.ticker.replace(/\.(NZ|AX|L)$/i, "")}
                            </button>
                            <p className="max-w-[9rem] truncate text-[0.62rem] text-muted-foreground sm:hidden">
                              {s.name}
                            </p>
                          </td>
                          <td className="hidden max-w-[16rem] truncate px-3 py-2.5 text-muted-foreground sm:table-cell">
                            {s.name}
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <span
                              className={cn(
                                "tnum inline-flex items-center justify-end gap-0.5 font-semibold",
                                pctClass(s.projected7dPct)
                              )}
                            >
                              {up ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />}
                              {fmtPct(s.projected7dPct)}
                            </span>
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center justify-end gap-1.5">
                              <Gauge className="size-3 text-muted-foreground" />
                              <div className="h-1.5 w-12 overflow-hidden rounded-full bg-muted/50">
                                <div
                                  className="h-full bg-primary/70"
                                  style={{ width: `${Math.max(0, Math.min(100, s.confidence))}%` }}
                                />
                              </div>
                              <span className="tnum w-8 text-right text-xs font-semibold">{s.confidence}%</span>
                            </div>
                          </td>
                          <td className="hidden max-w-[22rem] px-3 py-2.5 lg:table-cell">
                            <p className="line-clamp-2 text-[0.72rem] leading-relaxed text-muted-foreground">
                              {s.reasoning}
                            </p>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Disclaimer */}
          <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-[0.68rem] text-muted-foreground">
            <Info className="size-3.5 shrink-0" />
            AI-generated projections for informational purposes only — illustrative, not a guarantee
            of future performance and not financial advice.
          </p>
        </>
      )}

      {/* Detailed stock view (chart + stats + Stox AI pane), opened on ticker click */}
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
