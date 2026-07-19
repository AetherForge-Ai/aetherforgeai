"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Stock } from "@/lib/portfolio";
import { buildActionableIntelligence } from "@/lib/analytics";
import { formatMarketPrice, type AssetClass, type SecurityIntel } from "@/lib/market-intel";
import { cn } from "@/lib/utils";
import { pctClass, fmtPct, SignalBadge, ExchangeChip } from "@/components/dashboard/intel-ui";
import { useMarketIntel } from "@/components/dashboard/MarketIntelContext";
import { BuyDialog, type BuyTarget } from "@/components/dashboard/BuyDialog";
import { api } from "@/lib/api";
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
  ShoppingCart,
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

  const loadOtherUniverse = useCallback(async () => {
    const otherBot: AssetClass = bot === "crypto" ? "stock" : "crypto";
    setOtherLoading(true);
    try {
      const res = await api.get<{ live: boolean; universe: SecurityIntel[] }>(
        `/api/market?bot=${otherBot}&t=${Date.now()}`
      );
      if (res.ok && res.data?.universe) {
        setOtherUniverse(res.data.universe);
        console.log(
          `[actionable-intel] Loaded ${res.data.universe.length} ${otherBot} securities for cross-market BUY list`
        );
      } else {
        console.error("[actionable-intel] Failed to load other universe:", res.error);
      }
    } finally {
      setOtherLoading(false);
    }
  }, [bot]);

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
  const { actionRequired, sellRecommendations, buyCandidates, pathways } = intel;

  const [buyTarget, setBuyTarget] = useState<BuyTarget | null>(null);
  const [buyOpen, setBuyOpen] = useState(false);

  function openBuy(c: (typeof buyCandidates)[number]) {
    // Route the Buy dialog to the correct asset class from the candidate's market.
    const type: AssetClass = c.market === "CRYPTO" ? "crypto" : "stock";
    setBuyTarget({ ticker: c.ticker, name: c.name, assetType: type, price: c.price });
    setBuyOpen(true);
  }

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
          <h2 className="font-display text-lg font-bold">Actionable intelligence</h2>
          <p className="text-xs text-muted-foreground">
            Explicit signals from your holdings + the full NZX · ASX · Dow Jones · NASDAQ · Crypto universe
          </p>
        </div>
      </div>

      {/* Immediate action banner */}
      {actionRequired ? (
        <div className="flex items-start gap-3 rounded-2xl border border-rose-500/40 bg-rose-500/10 px-5 py-4">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-rose-600" />
          <div>
            <p className="font-display font-bold text-rose-200">Immediate action required</p>
            <p className="text-sm text-rose-200/80">
              {sellRecommendations.length} holding{sellRecommendations.length === 1 ? "" : "s"} in your portfolio{" "}
              {sellRecommendations.length === 1 ? "is" : "are"} flagging elevated downside risk. Review the SELL
              recommendations below.
            </p>
          </div>
        </div>
      ) : stocks.length > 0 ? (
        <div className="flex items-start gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/8 px-5 py-4">
          <Shield className="mt-0.5 size-5 shrink-0 text-emerald-600" />
          <div>
            <p className="font-display font-bold text-emerald-200">No urgent exits</p>
            <p className="text-sm text-emerald-200/80">
              None of your current holdings trigger a SELL signal this session. Consider the BUY candidates below to
              deploy capital.
            </p>
          </div>
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-2">
        {/* SELL recommendations */}
        <div className="rounded-2xl border border-border/70 bg-card/40 p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-rose-700">
            <ArrowDownRight className="size-4" /> SELL recommendations
            <span className="text-xs font-normal text-muted-foreground">(from your holdings)</span>
          </div>
          {sellRecommendations.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No holdings currently flag a sell signal. 🎯
            </p>
          ) : (
            <div className="space-y-3">
              {sellRecommendations.map((r) => (
                <div key={r.ticker} className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-display text-sm font-bold">{r.ticker.replace(/\.(NZ|AX)$/, "")}</span>
                      <SignalBadge signal={r.signal} />
                      {r.urgency === "high" && (
                        <span className="rounded-full bg-rose-500/20 px-2 py-0.5 text-[0.6rem] font-bold uppercase text-rose-700">
                          Urgent
                        </span>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="tnum text-sm font-medium">{formatMarketPrice(r.price, "USD")}</p>
                      <p className="text-[0.62rem] text-muted-foreground">
                        {r.weight}% wt · <span className={pctClass(r.gainPct)}>{fmtPct(r.gainPct)}</span> P&amp;L
                      </p>
                    </div>
                  </div>
                  <p className="mt-1.5 text-[0.72rem] leading-relaxed text-muted-foreground">{r.reasoning}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* BUY candidates */}
        <div className="rounded-2xl border border-border/70 bg-card/40 p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
              <ArrowUpRight className="size-4" /> High-conviction BUY candidates
              <span className="text-xs font-normal text-muted-foreground">
                (not held · NZX · ASX · DJIA · NASDAQ · Crypto)
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 px-2.5 text-xs"
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
          {buyCandidates.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No fresh buy signals right now.</p>
          ) : (
            <div className="space-y-3">
              {buyCandidates.map((c) => (
                <div key={c.ticker} className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="font-display text-sm font-bold">{c.ticker.replace(/\.(NZ|AX)$/, "")}</span>
                      <ExchangeChip ticker={c.ticker} market={c.market} />
                      <SignalBadge signal={c.signal} />
                    </div>
                    <div className="text-right">
                      <p className="tnum text-sm font-medium">{formatMarketPrice(c.price, c.currency)}</p>
                      <p className="text-[0.62rem] text-muted-foreground">
                        <span className={pctClass(c.projected7dPct)}>{fmtPct(c.projected7dPct)}</span> · {c.confidence}% conf.
                      </p>
                    </div>
                  </div>
                  <p className="mt-1.5 text-[0.72rem] leading-relaxed text-muted-foreground">{c.reasoning}</p>
                  <div className="mt-2.5 flex justify-end">
                    <Button
                      size="sm"
                      className="h-7 gap-1.5 px-3 text-xs font-semibold shadow-glow"
                      onClick={() => openBuy(c)}
                    >
                      <ShoppingCart className="size-3.5" /> Buy
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {lastUpdated && (
            <p className="mt-3 text-right text-[0.62rem] text-muted-foreground">Updated {lastUpdated}</p>
          )}
        </div>
      </div>

      {/* Forward pathways */}
      <div>
        <p className="mb-3 text-sm font-semibold">Three forward pathways</p>
        <div className="grid gap-4 md:grid-cols-3">
          {pathways.map((p) => {
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
                <div className="mt-3 flex items-end gap-3">
                  <div>
                    <p className="text-[0.62rem] uppercase text-muted-foreground">7-day target</p>
                    <p className={cn("tnum font-display text-xl font-bold", pctClass(p.targetPct))}>{fmtPct(p.targetPct)}</p>
                  </div>
                  <div>
                    <p className="text-[0.62rem] uppercase text-muted-foreground">Probability</p>
                    <p className="tnum font-display text-xl font-bold">{p.probability}%</p>
                  </div>
                </div>
                <p className="mt-3 text-[0.72rem] text-muted-foreground">{p.summary}</p>
                <ul className="mt-3 space-y-1.5">
                  {p.steps.map((s, i) => (
                    <li key={i} className="flex gap-2 text-[0.72rem] text-foreground/80">
                      <span className="mt-1 size-1.5 shrink-0 rounded-full bg-primary" />
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-[0.68rem] italic text-muted-foreground">
          Informational market intelligence only — not personalised financial advice.
        </p>
      </div>

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
