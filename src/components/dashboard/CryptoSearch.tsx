"use client";

/**
 * CryptoSearch — a searchable coin picker for adding a crypto holding.
 *
 * Mirrors the stock TickerSearch, but is backed by the live top-500 crypto
 * universe (via `useCryptoMarkets`, Swyftx-priced). Selecting a coin reports the
 * full CoinMarket back so the caller can auto-fill the live buy price. Filtering
 * is client-side because the whole universe is already cached in memory.
 */

import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Check, ChevronsUpDown, Loader2, Search } from "lucide-react";
import {
  clearDialogSearchGuard,
  markDialogSearchGuard,
  markDialogSelectGuard,
  noteDialogSearchQuery,
} from "@/lib/dialog-guards";
import { useCryptoMarkets } from "@/hooks/useCryptoMarkets";
import { api } from "@/lib/api";
import { dexRowToCoin, type DexTokenRow } from "@/lib/crypto-dex";
import { coinLogo, fmtPrice, fmtPct, pctColor, GENERIC_COIN_ICON, type CoinMarket } from "@/lib/crypto-market";

export function CryptoSearch({
  value,
  label,
  onSelect,
  placeholder = "Search any coin — Bitcoin, ETH, Solana…",
  embedInDialog = true,
  onQueryChange,
}: {
  value?: string; // currently-selected symbol (e.g. "BTC")
  label?: string; // coin name to show alongside the symbol on the trigger
  onSelect: (coin: CoinMarket) => void;
  placeholder?: string;
  embedInDialog?: boolean;
  onQueryChange?: (query: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const setQueryAndNotify = React.useCallback(
    (q: string) => {
      setQuery(q);
      noteDialogSearchQuery(q);
      onQueryChange?.(q);
    },
    [onQueryChange]
  );
  // Only auto-fetch the universe once the picker is opened.
  const { coins, loading } = useCryptoMarkets(open);
  const [dexCoins, setDexCoins] = React.useState<CoinMarket[]>([]);

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void api.get<DexTokenRow[]>("/api/crypto/dex").then((res) => {
      if (cancelled || !res.ok || !Array.isArray(res.data)) return;
      setDexCoins(res.data.map((row, index) => dexRowToCoin(row, 1000 + index)));
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Keep the dialog search guard for the whole popover lifetime (same as
  // TickerSearch) — do not clear on fetch settle or holdings re-renders will
  // dismiss the parent Buy/Add dialog.
  React.useEffect(() => {
    if (!open) {
      clearDialogSearchGuard(400);
      return;
    }
    markDialogSearchGuard(30_000);
  }, [open, loading]);

  const universe = React.useMemo(() => {
    const seen = new Set(coins.map((coin) => coin.symbol.toUpperCase()));
    const extra = dexCoins.filter((coin) => !seen.has(coin.symbol.toUpperCase()));
    return [...coins, ...extra];
  }, [coins, dexCoins]);

  const results = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? universe.filter((c) => c.symbol.toLowerCase().includes(q) || c.name.toLowerCase().includes(q))
      : universe;
    return base.slice(0, 60);
  }, [universe, query]);

  // b77 (TT b75 P2 a11y): own listbox instead of cmdk. cmdk wraps options in sizer/group divs inside
  // role="listbox" (axe aria-required-children). Options are now direct role="option" children, and the
  // input drives them with aria-activedescendant.
  const listId = React.useId();
  const [active, setActive] = React.useState(0);
  React.useEffect(() => setActive(0), [query, open]);
  const optionId = (i: number) => `${listId}-opt-${i}`;
  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!results.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(results.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const c = results[active];
      if (c) pick(c);
    }
  }
  React.useEffect(() => {
    if (!open) return;
    document.getElementById(optionId(active))?.scrollIntoView({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, open]);

  function pick(c: CoinMarket) {
    markDialogSelectGuard();
    markDialogSearchGuard(900);
    onSelect(c);
    requestAnimationFrame(() => {
      setOpen(false);
      setQueryAndNotify("");
    });
  }

  function handleOpenChange(next: boolean) {
    if (next) markDialogSearchGuard(30_000);
    else {
      markDialogSelectGuard(450);
      clearDialogSearchGuard(900);
    }
    setOpen(next);
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange} modal={!embedInDialog}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={value ? `Cryptocurrency: ${value}${label ? ` ${label}` : ""}. Change` : "Select a cryptocurrency"}
          className="w-full justify-between font-normal"
        >
          {value ? (
            <span className="flex min-w-0 items-center gap-2">
              <span className="font-display font-bold">{value}</span>
              {label ? <span className="truncate text-muted-foreground">— {label}</span> : null}
            </span>
          ) : (
            <span className="flex items-center gap-2 text-muted-foreground">
              <Search className="size-4" /> Select a cryptocurrency
            </span>
          )}
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        portalled={!embedInDialog}
        className="pointer-events-auto z-[60] w-[--radix-popover-trigger-width] p-0"
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        onPointerDown={(e) => e.stopPropagation()}
        data-af-ticker-search-panel=""
      >
        <div className="flex items-center gap-2 border-b px-3">
          <Search className="size-4 shrink-0 opacity-50" aria-hidden="true" />
          <input
            autoFocus
            type="text"
            role="combobox"
            aria-label="Search coins"
            aria-expanded={results.length > 0}
            aria-controls={results.length ? listId : undefined}
            aria-autocomplete="list"
            aria-activedescendant={results.length ? optionId(active) : undefined}
            placeholder={placeholder}
            value={query}
            onChange={(e) => setQueryAndNotify(e.target.value)}
            onKeyDown={onKeyDown}
            className="flex h-10 w-full bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        {loading && coins.length === 0 ? (
          <div role="status" className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Loading live coin prices…
          </div>
        ) : results.length === 0 ? (
          <div role="status" className="py-6 text-center text-sm">No coin matches “{query}”.</div>
        ) : (
          <>
            <div className="px-3 pt-2 text-xs font-medium text-muted-foreground" aria-hidden="true">
              {query.trim() ? `${results.length} match${results.length === 1 ? "" : "es"}` : "Top coins by market cap"}
            </div>
            <div
              id={listId}
              role="listbox"
              aria-label={query.trim() ? `${results.length} matching coins` : "Top coins by market cap"}
              className="max-h-[300px] overflow-y-auto p-1"
            >
              {results.map((c, i) => (
                <div
                  key={c.id}
                  id={optionId(i)}
                  role="option"
                  aria-selected={i === active}
                  aria-label={`${c.symbol} ${c.name}`}
                  data-selected={i === active ? "true" : undefined}
                  onMouseEnter={() => setActive(i)}
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => pick(c)}
                  className={cn(
                    "flex cursor-default select-none items-center gap-2.5 rounded-sm px-2 py-1.5 text-sm",
                    i === active && "bg-accent text-accent-foreground"
                  )}
                >
                  <Check className={cn("size-4 shrink-0", value === c.symbol ? "opacity-100" : "opacity-0")} aria-hidden="true" />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={c.image || coinLogo(c.symbol)}
                    alt=""
                    className="size-5 shrink-0 rounded-full"
                    onError={(e) => {
                      const t = e.currentTarget;
                      if (t.dataset.fb) return;
                      t.dataset.fb = "1";
                      t.src = GENERIC_COIN_ICON;
                    }}
                  />
                  <span className="font-display text-sm font-bold">{c.symbol}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{c.name}</span>
                  <span className="tnum shrink-0 text-right text-sm font-semibold">
                    {c.priceUnavailable || !(c.price > 0) ? "Unavailable" : fmtPrice(c.price)}
                  </span>
                  <span className={cn("tnum w-14 shrink-0 text-right text-[0.68rem] font-medium", pctColor(c.change24h))}>
                    {fmtPct(c.change24h)}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

export default CryptoSearch;
