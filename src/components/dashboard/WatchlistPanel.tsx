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
import { pctClass, fmtPct } from "@/components/dashboard/intel-ui";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Plus, X, Loader2 } from "lucide-react";
import { RailCard } from "@/components/dashboard/rail/RailCard";

interface WatchItem {
  _id: string;
  ticker: string;
  name: string;
  asset_type: AssetClass;
  market: string;
}

export function WatchlistPanel({
  bot,
  reloadSignal = 0,
  preview = false,
  seedTicker = null,
  seedNonce = 0,
  headerAction,
  cardId = "dashboard-watchlist",
}: {
  bot: AssetClass;
  reloadSignal?: number;
  preview?: boolean;
  seedTicker?: string | null;
  seedNonce?: number;
  /** Control shown in the card header (the Shares / Crypto switch). */
  headerAction?: React.ReactNode;
  cardId?: string;
}) {
  const { universe } = useMarketIntel();
  const [items, setItems] = React.useState<WatchItem[]>([]);
  const [loading, setLoading] = React.useState(!preview);
  const [ticker, setTicker] = React.useState("");
  const [adding, setAdding] = React.useState(false);

  const intelByTicker = React.useMemo(() => {
    const map = new Map<string, SecurityIntel>();
    (universe ?? []).forEach((s) => map.set(s.ticker.toUpperCase(), s));
    return map;
  }, [universe]);

  // b6 H-1: when the intel list has no print for a watched symbol, ask the same
  // quote route the ticker tape and /markets use (Yahoo close or live print).
  const [quotes, setQuotes] = React.useState<Record<string, { price: number; changePct: number | null; currency: string }>>({});
  const asked = React.useRef(new Set<string>());
  React.useEffect(() => {
    if (preview) return;
    const missing = items
      .map((item) => item.ticker.toUpperCase())
      .filter((t) => {
        const intel = intelByTicker.get(t);
        return !(intel && Number.isFinite(intel.price) && intel.price > 0) && !quotes[t] && !asked.current.has(t);
      });
    if (!missing.length) return;
    missing.forEach((t) => asked.current.add(t));
    let cancelled = false;
    void Promise.all(
      missing.slice(0, 12).map(async (t) => {
        const res = await api.get<{ price: number | null; changePct?: number | null; currency?: string }>(
          `/api/tickers/quote?symbol=${encodeURIComponent(t)}&type=${bot === "crypto" ? "crypto" : "stock"}`
        );
        if (!res.ok || !res.data?.price || !(res.data.price > 0)) return null;
        return [t, { price: res.data.price, changePct: res.data.changePct ?? null, currency: res.data.currency || "NZD" }] as const;
      })
    ).then((pairs) => {
      if (cancelled) return;
      const found = pairs.filter((p): p is NonNullable<typeof p> => p != null);
      if (found.length) setQuotes((prev) => ({ ...prev, ...Object.fromEntries(found) }));
    });
    return () => {
      cancelled = true;
    };
  }, [items, intelByTicker, bot, preview, quotes]);

  const load = React.useCallback(async () => {
    if (preview) return; // guest preview: no live watchlist fetch
    setLoading(true);
    const res = await api.get<WatchItem[]>(`/api/watchlist?asset_type=${bot}`);
    if (res.ok && res.data) setItems(res.data);
    else console.error("[WatchlistPanel] load failed:", res.error);
    setLoading(false);
  }, [bot, preview]);

  React.useEffect(() => {
    load();
  }, [load, reloadSignal]);

  const postedWatch = React.useRef(0);
  React.useEffect(() => {
    const ticker = seedTicker?.trim().toUpperCase() || "";
    if (!ticker || preview || !seedNonce || postedWatch.current === seedNonce) return;
    postedWatch.current = seedNonce;
    void (async () => {
      const res = await api.post<WatchItem>("/api/watchlist", { ticker, asset_type: bot });
      if (res.ok) {
        toast.success(`${ticker} added to watchlist`);
        void load();
      } else {
        toast.error(typeof res.error === "string" ? res.error : "Could not add to watchlist.");
      }
    })();
  }, [seedNonce, seedTicker, bot, preview, load]);

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

  const inputId = `watchlist-add-${bot}`;
  return (
    <RailCard
      id={cardId}
      title="Watchlist"
      description={`Track ${bot === "crypto" ? "coins" : "tickers"} you don't own yet`}
      action={headerAction}
    >
      <form onSubmit={addTicker} className="flex gap-2">
        <label htmlFor={inputId} className="sr-only">
          {bot === "crypto" ? "Add a coin to the watchlist" : "Add a ticker to the watchlist"}
        </label>
        <Input
          id={inputId}
          placeholder={bot === "crypto" ? "Add coin (e.g. SOL)" : "Add ticker (e.g. TSLA)"}
          value={ticker}
          onChange={(e) => setTicker(e.target.value.toUpperCase())}
          className="min-h-11 min-w-0 uppercase placeholder:normal-case md:min-h-9"
          autoComplete="off"
        />
        <Button type="submit" disabled={adding} className="size-11 shrink-0 bg-[#047857] font-semibold text-white hover:bg-[#065f46] md:size-9" aria-label="Add to watchlist">
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
            Nothing tracked yet. Add a symbol above to keep an eye on it.
          </p>
        ) : (
          <ul className="divide-y divide-border/40">
            {items.map((item) => {
              const key = item.ticker.toUpperCase();
              const fromIntel = intelByTicker.get(key);
              const quote = quotes[key];
              const intel =
                fromIntel && Number.isFinite(fromIntel.price) && fromIntel.price > 0
                  ? { price: fromIntel.price, currency: fromIntel.currency, change1d: fromIntel.change1d }
                  : quote
                    ? { price: quote.price, currency: quote.currency as SecurityIntel["currency"], change1d: quote.changePct ?? NaN }
                    : null;
              const priced = intel != null;
              return (
                <li key={item._id} className="flex items-center gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <span className="text-sm font-semibold">{item.ticker.replace(/\.(NZ|AX)$/, "")}</span>
                    <p className="truncate text-xs text-muted-foreground">{item.name}</p>
                  </div>
                  <div className="text-right">
                    <p className="tnum text-sm font-medium">{priced ? formatMarketPrice(intel!.price, intel!.currency) : "—"}</p>
                    <p className={cn("tnum text-xs font-semibold", priced ? pctClass(intel!.change1d) : "text-muted-foreground")}>
                      {priced && Number.isFinite(intel!.change1d) ? `${fmtPct(intel!.change1d)} today` : priced ? "Change not stated" : "No price yet"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeItem(item)}
                    className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-destructive/15 hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring"
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
    </RailCard>
  );
}
