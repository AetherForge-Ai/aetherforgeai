"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Sparkline } from "./Sparkline";
import { useCryptoMarkets } from "@/hooks/useCryptoMarkets";
import {
  selectCoins,
  fmtPrice,
  fmtCompactUsd,
  fmtPct,
  pctColor,
  GENERIC_COIN_ICON,
  SORT_OPTIONS,
  FILTER_OPTIONS,
  type SortKey,
  type FilterKey,
  type CoinMarket,
} from "@/lib/crypto-market";
import { RefreshCw, Search, Loader2, ChevronRight, Info } from "lucide-react";

const ROW_H = 56; // px — fixed row height enables cheap windowing
const OVERSCAN = 8;

/** Debounce a fast-changing value (search box). */
function useDebounced<T>(value: T, delay: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return v;
}

export function CryptoMarketModal({
  open,
  onOpenChange,
  onSelectCoin,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSelectCoin: (id: string) => void;
}) {
  const { coins, loading, refreshing, error, lastUpdated, refresh } = useCryptoMarkets(open);

  // Toolbar state is preserved across close/reopen because this component stays
  // mounted in the section wrapper (Radix just toggles visibility).
  const [searchRaw, setSearchRaw] = useState("");
  const search = useDebounced(searchRaw, 250);
  const [sort, setSort] = useState<SortKey>("market_cap");
  const [filter, setFilter] = useState<FilterKey>("all");

  const rows = useMemo(
    () => selectCoins(coins, { search, sort, filter }),
    [coins, search, sort, filter]
  );

  // ---- Windowing ----
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(480);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => setViewportH(el.clientHeight || 480);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open]);

  // Reset scroll to top when the filtered set changes materially.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    setScrollTop(0);
  }, [search, sort, filter]);

  const total = rows.length;
  const startIdx = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN);
  const endIdx = Math.min(total, Math.ceil((scrollTop + viewportH) / ROW_H) + OVERSCAN);
  const visible = rows.slice(startIdx, endIdx);

  const lastLabel = lastUpdated
    ? lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "—";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[92vh] w-[97vw] max-w-6xl flex-col gap-0 overflow-hidden p-0">
        {/* Header */}
        <DialogHeader className="border-b border-border/60 px-5 py-4 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <DialogTitle className="font-display text-xl">
                Crypto Market <span className="text-muted-foreground">— Live Top 500 Cryptocurrencies</span>
              </DialogTitle>
              <DialogDescription className="mt-0.5 flex items-center gap-2 text-xs">
                Last updated: {lastLabel}
                {refreshing && <Loader2 className="size-3 animate-spin" />}
              </DialogDescription>
            </div>
            <Button variant="outline" size="sm" onClick={refresh} disabled={loading || refreshing} className="gap-1.5">
              <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} /> Refresh Data
            </Button>
          </div>

          {/* Toolbar */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="relative min-w-[180px] flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchRaw}
                onChange={(e) => setSearchRaw(e.target.value)}
                placeholder="Search name or symbol…"
                className="h-9 pl-8"
              />
            </div>
            <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
              <SelectTrigger className="h-9 w-[168px]">
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex flex-wrap gap-1">
              {FILTER_OPTIONS.map((f) => (
                <button
                  key={f.value}
                  onClick={() => setFilter(f.value)}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-xs font-semibold transition",
                    filter === f.value
                      ? "bg-primary text-primary-foreground"
                      : "bg-background/60 text-muted-foreground hover:text-foreground"
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </DialogHeader>

        {/* Column header */}
        <div className="grid grid-cols-[48px_minmax(140px,1.6fr)_repeat(2,minmax(72px,1fr))_repeat(3,minmax(96px,1.1fr))_100px_44px] items-center gap-2 border-b border-border/60 bg-background/40 px-4 py-2 text-[0.6rem] font-semibold uppercase tracking-wide text-muted-foreground sm:px-6">
          <span>#</span>
          <span>Coin</span>
          <span className="text-right">Price</span>
          <span className="text-right">24h</span>
          <span className="text-right">7d</span>
          <span className="text-right">Market Cap</span>
          <span className="text-right">Volume 24h</span>
          <span className="text-center">7d Chart</span>
          <span />
        </div>

        {/* Virtualized body */}
        <div
          ref={scrollRef}
          onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)}
          className="min-h-0 flex-1 overflow-y-auto"
        >
          {loading ? (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <Loader2 className="mr-2 size-5 animate-spin" /> Loading top 500 cryptocurrencies…
            </div>
          ) : error && coins.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
              {typeof error === "string" ? error : "Unable to load crypto markets."}
              <Button variant="outline" size="sm" onClick={refresh}>
                Try again
              </Button>
            </div>
          ) : total === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              No coins match your search.
            </div>
          ) : (
            <div style={{ height: total * ROW_H, position: "relative" }}>
              {visible.map((c, i) => (
                <Row
                  key={c.id}
                  coin={c}
                  top={(startIdx + i) * ROW_H}
                  onClick={() => onSelectCoin(c.id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer / attribution */}
        <div className="flex items-center justify-between gap-2 border-t border-border/60 px-4 py-2 text-[0.62rem] text-muted-foreground sm:px-6">
          <span className="inline-flex items-center gap-1">
            <Info className="size-3" /> Data via Swyftx (may be delayed up to ~60s)
          </span>
          <span className="tnum">
            Showing {total} of {coins.length} coins
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Row({ coin, top, onClick }: { coin: CoinMarket; top: number; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{ position: "absolute", top, height: ROW_H, left: 0, right: 0 }}
      className="grid w-full grid-cols-[48px_minmax(140px,1.6fr)_repeat(2,minmax(72px,1fr))_repeat(3,minmax(96px,1.1fr))_100px_44px] items-center gap-2 border-b border-border/40 px-4 text-sm transition hover:bg-primary/5 sm:px-6"
    >
      <span className="tnum text-xs text-muted-foreground">{coin.rank}</span>
      <span className="flex min-w-0 items-center gap-2 text-left">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={coin.image}
          alt=""
          className="size-6 shrink-0 rounded-full"
          loading="lazy"
          onError={(e) => {
            const t = e.currentTarget;
            if (t.dataset.fb) return;
            t.dataset.fb = "1";
            t.src = GENERIC_COIN_ICON;
          }}
        />
        <span className="min-w-0">
          <span className="block truncate font-medium leading-tight">{coin.name}</span>
          <span className="block text-[0.66rem] uppercase text-muted-foreground">{coin.symbol}</span>
        </span>
      </span>
      <span className="tnum text-right font-medium">{fmtPrice(coin.price)}</span>
      <span className={cn("tnum text-right font-semibold", pctColor(coin.change24h))}>{fmtPct(coin.change24h)}</span>
      <span className={cn("tnum text-right font-semibold", pctColor(coin.change7d))}>{fmtPct(coin.change7d)}</span>
      <span className="tnum text-right text-muted-foreground">{fmtCompactUsd(coin.marketCap)}</span>
      <span className="tnum text-right text-muted-foreground">{fmtCompactUsd(coin.volume24h)}</span>
      <span className="flex justify-center">
        <Sparkline data={coin.sparkline7d} />
      </span>
      <span className="flex justify-end text-muted-foreground">
        <ChevronRight className="size-4" />
      </span>
    </button>
  );
}
