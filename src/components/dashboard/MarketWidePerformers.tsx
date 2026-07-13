"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import {
  getTopPerformers,
  formatMarketPrice,
  type SecurityIntel,
} from "@/lib/market-intel";
import { pctClass, fmtPct, SignalBadge, ExchangeChip } from "@/components/dashboard/intel-ui";
import { BuyDialog, type BuyTarget } from "@/components/dashboard/BuyDialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Rocket,
  RefreshCw,
  Loader2,
  ShoppingCart,
  ArrowUp,
  ArrowDown,
  TrendingUp,
  Info,
} from "lucide-react";

/**
 * Projected Top Performers — a MARKET-WIDE scan, not just the user's holdings.
 *
 * It merges the fully-analysed universes of BOTH asset classes and surfaces the
 * strongest projected movers across the entire market:
 *   • Entire crypto market (major coins by market cap + momentum)
 *   • Entire NZX   • Entire ASX   • Dow Jones components   • NASDAQ growth/tech
 *
 * DATA SOURCES (already live — keyless, server-side):
 *   • Stocks → GET /api/market?bot=stock  → Yahoo Finance daily closes & quotes
 *   • Crypto → GET /api/market?bot=crypto → CoinGecko markets + Yahoo histories
 * To swap in a different provider later, change those two routes only; this
 * component just consumes the analysed `SecurityIntel[]` they return, so the UI
 * never has to change. Ranking/projection lives in src/lib/market-intel.ts
 * (getTopPerformers → conviction-weighted 7-day upside blended with real momentum).
 */

type MarketFilter = "all" | "crypto" | "NZX" | "ASX" | "US";

const FILTERS: { key: MarketFilter; label: string }[] = [
  { key: "all", label: "All markets" },
  { key: "crypto", label: "Crypto" },
  { key: "NZX", label: "NZX" },
  { key: "ASX", label: "ASX" },
  { key: "US", label: "US · Dow & NASDAQ" },
];

/** Friendly market label for a security. */
function marketLabel(s: SecurityIntel): string {
  if (s.market === "CRYPTO") return "Crypto";
  if (s.market === "US") return "US";
  return s.market; // NZX / ASX
}

function matchesFilter(s: SecurityIntel, f: MarketFilter): boolean {
  if (f === "all") return true;
  if (f === "crypto") return s.market === "CRYPTO";
  return s.market === f;
}

export function MarketWidePerformers({ onBought }: { onBought?: () => void }) {
  const [universe, setUniverse] = useState<SecurityIntel[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<MarketFilter>("all");
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [buyTarget, setBuyTarget] = useState<BuyTarget | null>(null);
  const [buyOpen, setBuyOpen] = useState(false);

  const load = useCallback(async (manual: boolean) => {
    if (manual) setRefreshing(true);
    else setLoading(true);
    console.log("[market-wide] Scanning crypto + NZX + ASX + Dow + NASDAQ…");
    // Pull BOTH asset classes in parallel and merge into one cross-market pool.
    const ts = Date.now();
    const [stockRes, cryptoRes] = await Promise.all([
      api.get<{ universe: SecurityIntel[] }>(`/api/market?bot=stock&t=${ts}`),
      api.get<{ universe: SecurityIntel[] }>(`/api/market?bot=crypto&t=${ts}`),
    ]);
    const merged: SecurityIntel[] = [
      ...(stockRes.ok && stockRes.data ? stockRes.data.universe : []),
      ...(cryptoRes.ok && cryptoRes.data ? cryptoRes.data.universe : []),
    ];
    if (merged.length > 0) {
      setUniverse(merged);
      setLastUpdated(new Date().toISOString());
      console.log(`[market-wide] Merged ${merged.length} securities across all markets`);
    } else {
      console.error("[market-wide] No market data returned", stockRes.error, cryptoRes.error);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    load(false);
  }, [load]);

  // Top 10 projected performers within the active market filter.
  const leaders = useMemo(() => {
    const pool = universe.filter((s) => matchesFilter(s, filter));
    return getTopPerformers(10, pool);
  }, [universe, filter]);

  function openBuy(s: SecurityIntel) {
    setBuyTarget({ ticker: s.ticker, name: s.name, assetType: s.assetClass, price: s.price });
    setBuyOpen(true);
  }

  const updated = lastUpdated
    ? new Date(lastUpdated).toLocaleTimeString("en-NZ", { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <section className="rounded-3xl border border-border/70 bg-card/50 p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-lg bg-primary/12 text-primary">
            <Rocket className="size-4" />
          </span>
          <div>
            <h2 className="font-display text-lg font-bold">Projected top performers</h2>
            <p className="text-xs text-muted-foreground">
              Market-wide scan · Crypto · NZX · ASX · Dow Jones &amp; NASDAQ
              {universe.length ? ` · ${universe.length} securities` : ""}
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 px-3 text-xs"
          onClick={() => load(true)}
          disabled={refreshing || loading}
        >
          {refreshing ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
          Refresh
        </Button>
      </div>

      {/* Market filter */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => {
          const active = filter === f.key;
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors",
                active
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border/60 bg-background/40 text-muted-foreground hover:text-foreground"
              )}
            >
              {f.label}
            </button>
          );
        })}
        {updated && <span className="ml-auto text-[0.6rem] text-muted-foreground">Updated {updated}</span>}
      </div>

      {/* Cards */}
      <div className="mt-5">
        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-40 animate-pulse rounded-2xl bg-muted/40" />
            ))}
          </div>
        ) : leaders.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/60 py-12 text-center text-sm text-muted-foreground">
            No projected movers found for this market right now.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {leaders.map((s, i) => {
              const up = s.projected7dPct >= 0;
              return (
                <div
                  key={s.ticker}
                  className="flex flex-col rounded-2xl border border-border/60 bg-background/40 p-4 transition-colors hover:border-primary/40"
                >
                  {/* Top row: rank + symbol + market */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="tnum grid size-6 shrink-0 place-items-center rounded-md bg-primary/12 text-[0.62rem] font-bold text-primary">
                        {i + 1}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-display text-sm font-bold">
                            {s.ticker.replace(/\.(NZ|AX)$/, "")}
                          </span>
                          <ExchangeChip ticker={s.ticker} market={s.market} />
                        </div>
                        <p className="max-w-[11rem] truncate text-[0.66rem] text-muted-foreground">{s.name}</p>
                      </div>
                    </div>
                    <SignalBadge signal={s.signal} />
                  </div>

                  {/* Price + projected upside */}
                  <div className="mt-3 flex items-end justify-between">
                    <div>
                      <p className="text-[0.6rem] uppercase tracking-wide text-muted-foreground">Current</p>
                      <p className="tnum font-display text-base font-bold">
                        {formatMarketPrice(s.price, s.currency)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[0.6rem] uppercase tracking-wide text-muted-foreground">7-day projected</p>
                      <p className={cn("tnum flex items-center justify-end gap-0.5 font-display text-base font-bold", pctClass(s.projected7dPct))}>
                        {up ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />}
                        {fmtPct(s.projected7dPct)}
                      </p>
                    </div>
                  </div>

                  {/* Rationale */}
                  <p className="mt-3 line-clamp-3 flex-1 text-[0.72rem] leading-relaxed text-muted-foreground">
                    {s.reasoning}
                  </p>

                  {/* Footer: market + confidence + buy */}
                  <div className="mt-3 flex items-center justify-between border-t border-border/50 pt-3">
                    <div className="flex items-center gap-2 text-[0.62rem] text-muted-foreground">
                      <span className="rounded bg-muted/50 px-1.5 py-0.5 font-semibold uppercase tracking-wide">
                        {marketLabel(s)}
                      </span>
                      <span className="flex items-center gap-0.5">
                        <TrendingUp className="size-3" /> {s.confidence}% conf.
                      </span>
                    </div>
                    <Button size="sm" className="h-8 gap-1.5 px-3 font-semibold shadow-glow" onClick={() => openBuy(s)}>
                      <ShoppingCart className="size-3.5" /> Buy
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Disclaimer */}
      <p className="mt-5 flex items-center justify-center gap-1.5 text-center text-[0.68rem] text-muted-foreground">
        <Info className="size-3.5 shrink-0" />
        Projections are illustrative and for informational purposes only. Not financial advice.
      </p>

      <BuyDialog
        open={buyOpen}
        onOpenChange={setBuyOpen}
        target={buyTarget}
        onDone={() => {
          setBuyOpen(false);
          onBought?.();
        }}
      />
    </section>
  );
}
