"use client";

/**
 * Watchlist panel — tickers/coins the user is tracking but does not necessarily
 * own (separate from portfolio holdings). Scoped to the active bot (stock or
 * crypto). Enriched with live technical intel from the market-intel context.
 */

import * as React from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatMarketPrice, type AssetClass, type SecurityIntel } from "@/lib/market-intel";
import { useMarketIntel } from "@/components/dashboard/MarketIntelContext";
import { SignalBadge, pctClass, fmtPct } from "@/components/dashboard/intel-ui";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Star, Plus, X, Loader2 } from "lucide-react";

interface WatchItem {
  _id: string;
  ticker: string;
  name: string;
  asset_type: AssetClass;
  market: string;
}

export function WatchlistPanel({ bot, reloadSignal = 0 }: { bot: AssetClass; reloadSignal?: number }) {
  const { universe } = useMarketIntel();
  const [items, setItems] = React.useState<WatchItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [ticker, setTicker] = React.useState("");
  const [adding, setAdding] = React.useState(false);

  const intelByTicker = React.useMemo(() => {
    const map = new Map<string, SecurityIntel>();
    (universe ?? []).forEach((s) => map.set(s.ticker.toUpperCase(), s));
    return map;
  }, [universe]);

  const load = React.useCallback(async () => {
    setLoading(true);
    const res = await api.get<WatchItem[]>(`/api/watchlist?asset_type=${bot}`);
    if (res.ok && res.data) setItems(res.data);
    else console.error("[WatchlistPanel] load failed:", res.error);
    setLoading(false);
  }, [bot]);

  React.useEffect(() => {
    load();
  }, [load, reloadSignal]);

  async function addTicker(e: React.FormEvent) {
    e.preventDefault();
    const t = ticker.trim().toUpperCase();
    if (!t) return;
    setAdding(true);
    console.log(`[WatchlistPanel] Adding ${t} (${bot})`);
    const res = await api.post<WatchItem>("/api/watchlist", { ticker: t, asset_type: bot });
    setAdding(false);
    if (res.ok) {
      setTicker("");
      toast.success(`${t} added to watchlist`);
      load();
    } else {
      console.error("[WatchlistPanel] add failed:", res.error);
      toast.error(typeof res.error === "string" ? res.error : "Could not add to watchlist.");
    }
  }

  async function removeItem(item: WatchItem) {
    console.log(`[WatchlistPanel] Removing ${item.ticker}`);
    const res = await api.delete(`/api/watchlist/${item._id}`);
    if (res.ok) {
      setItems((prev) => prev.filter((i) => i._id !== item._id));
    } else {
      console.error("[WatchlistPanel] remove failed:", res.error);
      toast.error("Could not remove from watchlist.");
    }
  }

  return (
    <section className="rounded-3xl border border-border/70 bg-card/50 p-6">
      <div className="flex items-center gap-3">
        <span
          className="grid size-9 place-items-center rounded-lg"
          style={{ backgroundColor: "color-mix(in oklab, var(--gold) 15%, transparent)", color: "var(--gold)" }}
        >
          <Star className="size-4" />
        </span>
        <div>
          <h2 className="font-display text-lg font-bold">Watchlist</h2>
          <p className="text-xs text-muted-foreground">
            Track {bot === "crypto" ? "coins" : "tickers"} you don&apos;t own yet
          </p>
        </div>
      </div>

      <form onSubmit={addTicker} className="mt-4 flex gap-2">
        <Input
          placeholder={bot === "crypto" ? "Add a coin (e.g. SOL)" : "Add a ticker (e.g. TSLA)"}
          value={ticker}
          onChange={(e) => setTicker(e.target.value.toUpperCase())}
          className="uppercase"
        />
        <Button type="submit" disabled={adding} className="shrink-0 font-semibold">
          {adding ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
        </Button>
      </form>

      <div className="mt-4">
        {loading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-muted/40" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border/60 p-4 text-center text-sm text-muted-foreground">
            Nothing tracked yet — add a symbol above to keep an eye on it.
          </p>
        ) : (
          <ul className="divide-y divide-border/40">
            {items.map((item) => {
              const intel = intelByTicker.get(item.ticker.toUpperCase());
              return (
                <li key={item._id} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-display text-sm font-semibold">
                        {item.ticker.replace(/\.(NZ|AX)$/, "")}
                      </span>
                      {intel && <SignalBadge signal={intel.signal} />}
                    </div>
                    <p className="truncate text-[0.68rem] text-muted-foreground">{item.name}</p>
                  </div>
                  {intel ? (
                    <div className="text-right">
                      <p className="tnum text-sm font-medium">{formatMarketPrice(intel.price, intel.currency)}</p>
                      <p className={cn("tnum text-[0.72rem] font-semibold", pctClass(intel.change1d))}>
                        {fmtPct(intel.change1d)}
                      </p>
                    </div>
                  ) : (
                    <span className="text-[0.68rem] text-muted-foreground">Tracking</span>
                  )}
                  <button
                    onClick={() => removeItem(item)}
                    className="grid size-7 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive"
                    aria-label={`Remove ${item.ticker}`}
                  >
                    <X className="size-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
