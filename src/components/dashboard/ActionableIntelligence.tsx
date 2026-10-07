"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Stock } from "@/lib/portfolio";
import { buildActionableIntelligence } from "@/lib/analytics";
import { formatMarketPrice, type AssetClass, type SecurityIntel } from "@/lib/market-intel";
import { cn } from "@/lib/utils";
import { pctClass, fmtPct, ExchangeChip } from "@/components/dashboard/intel-ui";
import { useMarketIntel } from "@/components/dashboard/MarketIntelContext";
import { isTransactionDialogOpen } from "@/lib/transaction-sticky";
import { getTxDialogSnapshot, subscribeTxDialog } from "@/lib/transaction-dialog-store";
import { api } from "@/lib/api";
import { technicalSnapshot } from "@/lib/public-intel";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Shield,
  Scale,
  Rocket,
  RefreshCw,
  Loader2,
  ChevronDown,
} from "lucide-react";

const PATHWAY_ICON = {
  "Low Risk": Shield,
  Balanced: Scale,
  "High Risk": Rocket,
} as const;

const PATHWAY_TONE = {
  "Low Risk": "border-emerald-500/30 bg-emerald-500/5",
  Balanced: "border-primary/30 bg-primary/5",
  "High Risk": "border-orange-500/30 bg-orange-500/5",
} as const;

export function ActionableIntelligence({
  stocks,
  assetClass = "stock",
  onBought,
}: {
  stocks: Stock[];
  assetClass?: AssetClass;
  onBought?: () => void;
}) {
  const { universe, refresh, refreshing, lastUpdated, bot } = useMarketIntel();

  // Also load the OTHER bot's universe so BUY candidates span NZX + ASX +
  // Dow Jones + NASDAQ + Crypto, not just the active bot.
  const [otherUniverse, setOtherUniverse] = useState<SecurityIntel[] | null>(null);
  const [otherLoading, setOtherLoading] = useState(false);
  const pendingOtherRef = useRef<SecurityIntel[] | null>(null);

  const loadOtherUniverse = useCallback(async () => {
    const otherBot: AssetClass = bot === "crypto" ? "stock" : "crypto";
    setOtherLoading(true);
    try {
      const res = await api.get<{ live: boolean; universe: SecurityIntel[] }>(
        `/api/market?bot=${otherBot}&t=${Date.now()}`
      );
      if (res.ok && res.data?.universe) {
        // This panel is open on /dashboard/stocks. Applying a second universe
        // while Buy/Add is searching re-renders the hub under the dialog.
        if (isTransactionDialogOpen()) {
          pendingOtherRef.current = res.data.universe;
          console.log("[actionable-intel] Other universe deferred — Transaction dialog open");
        } else {
          pendingOtherRef.current = null;
          setOtherUniverse(res.data.universe);
          console.log(
            `[actionable-intel] Loaded ${res.data.universe.length} ${otherBot} securities for cross-market BUY list`
          );
        }
      } else {
        console.error("[actionable-intel] Failed to load other universe:", res.error);
      }
    } finally {
      setOtherLoading(false);
    }
  }, [bot]);

  useEffect(() => {
    return subscribeTxDialog(() => {
      if (getTxDialogSnapshot().open) return;
      const pending = pendingOtherRef.current;
      if (!pending) return;
      pendingOtherRef.current = null;
      setOtherUniverse(pending);
    });
  }, []);

  useEffect(() => {
    loadOtherUniverse();
  }, [loadOtherUniverse]);

  // Combined universe: active bot (from context) + the other bot.
  const combinedUniverse = useMemo(() => {
    const map = new Map<string, SecurityIntel>();
    for (const item of universe || []) {
      map.set(item.ticker.toUpperCase(), item);
    }
    for (const item of otherUniverse || []) {
      if (!map.has(item.ticker.toUpperCase())) {
        map.set(item.ticker.toUpperCase(), item);
      }
    }
    return map.size > 0 ? Array.from(map.values()) : null;
  }, [universe, otherUniverse]);

  const intel = useMemo(
    () => buildActionableIntelligence(stocks, assetClass, combinedUniverse),
    [stocks, assetClass, combinedUniverse]
  );
  const { actionRequired, sellRecommendations } = intel;

  const snapshots = useMemo(() => {
    const held = new Set(stocks.map((s) => s.ticker.toUpperCase()));
    return (combinedUniverse || [])
      .filter((row) => row.market !== "CRYPTO" && row.assetClass !== "crypto")
      .filter((row) => !held.has(row.ticker.toUpperCase()))
      .sort((a, b) => b.score - a.score)
      .slice(0, 12);
  }, [combinedUniverse, stocks]);

  const [snapshotsMinimized, setSnapshotsMinimized] = useState(false);

  function handleRefresh() {
    refresh();
    loadOtherUniverse();
  }

  return (
    <section className="space-y-5">
      <div className="flex items-center gap-3">
        <span className="grid size-9 place-items-center rounded-lg bg-primary/12 text-primary">
          <Scale className="size-4" />
        </span>
        <div>
          <h2 className="font-display text-lg font-bold">Market snapshots</h2>
          <p className="text-xs text-muted-foreground">
            Technical snapshots from your holdings and the wider share universe. Not personalised advice — you execute elsewhere.
          </p>
        </div>
      </div>

      {/* Immediate action banner */}
      {actionRequired ? (
        <div className="flex items-start gap-3 rounded-2xl border border-rose-500/40 bg-rose-500/10 px-5 py-4">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-rose-600" />
          <div>
            <p className="font-display font-bold text-rose-200">Downside scenario flagged</p>
            <p className="text-sm text-rose-200/80">
              {sellRecommendations.length} holding{sellRecommendations.length === 1 ? "" : "s"} in your portfolio{" "}
              {sellRecommendations.length === 1 ? "is" : "are"} modelled with elevated downside risk. Below is a
              scenario: what a full exit would look like. AetherForge does not trade for you.
            </p>
          </div>
        </div>
      ) : stocks.length > 0 ? (
        <div className="flex items-start gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/8 px-5 py-4">
          <Shield className="mt-0.5 size-5 shrink-0 text-emerald-600" />
          <div>
            <p className="font-display font-bold text-emerald-200">No urgent exits</p>
            <p className="text-sm text-emerald-200/80">
              None of your current holdings flag a full-exit scenario this session. Market snapshots
              are listed below. They are not an instruction to deploy cash.
            </p>
          </div>
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-2">
        {/* SELL recommendations */}
        <div className="rounded-2xl border border-border/70 bg-card/40 p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-rose-700">
            <ArrowDownRight className="size-4" /> Full-exit scenarios
            <span className="text-xs font-normal text-muted-foreground">(from your holdings)</span>
          </div>
          {sellRecommendations.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No holdings currently flag a full-exit scenario.
            </p>
          ) : (
            <div className="space-y-3">
              {sellRecommendations.map((r) => (
                <div key={r.ticker} className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-display text-sm font-bold">{r.ticker.replace(/\.(NZ|AX)$/, "")}</span>
                      {r.urgency === "high" && (
                        <span className="rounded-full bg-rose-500/20 px-2 py-0.5 text-[0.6rem] font-bold uppercase text-rose-700">
                          Urgent
                        </span>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="tnum text-sm font-medium">{formatMarketPrice(r.price, "USD")}</p>
                      <p className="text-[0.62rem] text-muted-foreground">
                        {r.weight}% wt  -  <span className={pctClass(r.gainPct)}>{fmtPct(r.gainPct)}</span> P&amp;L
                      </p>
                    </div>
                  </div>
                  <p className="mt-1.5 text-[0.72rem] leading-relaxed text-muted-foreground">
                    scenario: what a full exit would look like
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* BUY candidates - minimizable */}
        <div className="overflow-hidden rounded-2xl border border-border/70 bg-card/40">
          <div className="flex items-center gap-2 px-4 py-3 sm:px-5">
            <button
              type="button"
              onClick={() => setSnapshotsMinimized((m) => !m)}
              aria-expanded={!snapshotsMinimized}
              className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm font-semibold text-emerald-700"
            >
              <ArrowUpRight className="size-4 shrink-0" />
              <span className="truncate">Market snapshots</span>
              <span className="hidden text-xs font-normal text-muted-foreground sm:inline">
                (not held · NZX · ASX · DJIA · NASDAQ)
              </span>
              <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[0.65rem] font-semibold text-emerald-700">
                {snapshots.length}
              </span>
              <span className="ml-auto shrink-0 text-xs font-medium text-muted-foreground">
                {snapshotsMinimized ? "Expand" : "Minimize"}
              </span>
              <ChevronDown
                className={cn(
                  "size-4 shrink-0 text-muted-foreground transition-transform duration-300",
                  !snapshotsMinimized && "rotate-180"
                )}
              />
            </button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 shrink-0 gap-1.5 px-2.5 text-xs"
              onClick={handleRefresh}
              disabled={refreshing || otherLoading}
            >
              {refreshing || otherLoading ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <RefreshCw className="size-3.5" />
              )}
              Refresh
            </Button>
          </div>

          <div
            className={cn(
              "grid transition-all duration-300 ease-out",
              snapshotsMinimized ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"
            )}
          >
            <div className="overflow-hidden">
              <div className="border-t border-border/60 px-4 pb-4 pt-3 sm:px-5 sm:pb-5">
                {snapshots.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    No share-market snapshots right now.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {snapshots.map((c) => (
                      <div
                        key={c.ticker}
                        className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            <span className="font-display text-sm font-bold">
                              {c.ticker.replace(/\.(NZ|AX)$/, "")}
                            </span>
                            <ExchangeChip ticker={c.ticker} market={c.market} />
                          </div>
                          <div className="text-right">
                            <p className="tnum text-sm font-medium">
                              {formatMarketPrice(c.price, c.currency)}
                            </p>
                          </div>
                        </div>
                        <p className="mt-1.5 text-[0.72rem] leading-relaxed text-muted-foreground">
                          {technicalSnapshot({
                            rsi: c.rsi,
                            vsSma20: c.vsSma20,
                            regime: c.regime,
                            dailyVolPct: c.dailyVolPct,
                          })}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
                {lastUpdated && (
                  <p className="mt-3 text-right text-[0.62rem] text-muted-foreground">
                    Updated {lastUpdated}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Three outcome ranges. No rating and no forward percentage in the heading. */}
      <div>
        <p className="mb-3 text-sm font-semibold">
          Three scenarios: a cautious, a middle and a high-volatility case, so you can see the range of outcomes.
        </p>
        <div className="grid gap-4 md:grid-cols-3">
          {(
            [
              { name: "Cautious", risk: "Low Risk" as const, body: "A narrower outcome range from recent prices." },
              { name: "Middle", risk: "Balanced" as const, body: "The central outcome range from recent prices." },
              { name: "High volatility", risk: "High Risk" as const, body: "A wider outcome range when realised volatility is elevated." },
            ] as const
          ).map((p) => {
            const Icon = PATHWAY_ICON[p.risk];
            return (
              <div key={p.name} className={cn("rounded-2xl border p-5", PATHWAY_TONE[p.risk])}>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 font-display font-bold">
                    <Icon className="size-4" /> {p.name}
                  </span>
                  <span className="rounded-full border border-border/60 px-2 py-0.5 text-[0.62rem] font-semibold text-muted-foreground">
                    {p.risk}
                  </span>
                </div>
                <p className="mt-3 text-[0.72rem] text-muted-foreground">{p.body}</p>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-[0.68rem] italic text-muted-foreground">
          Informational market intelligence only. Not personalised financial advice.
        </p>
      </div>
    </section>
  );
}
