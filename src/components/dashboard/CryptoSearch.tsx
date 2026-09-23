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
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Check, ChevronsUpDown, Loader2, Search } from "lucide-react";
import {
  clearDialogSearchGuard,
  markDialogSearchGuard,
  markDialogSelectGuard,
} from "@/lib/dialog-guards";
import { useCryptoMarkets } from "@/hooks/useCryptoMarkets";
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
      onQueryChange?.(q);
    },
    [onQueryChange]
  );
  // Only auto-fetch the universe once the picker is opened.
  const { coins, loading } = useCryptoMarkets(open);

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

  const results = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? coins.filter((c) => c.symbol.toLowerCase().includes(q) || c.name.toLowerCase().includes(q))
      : coins;
    return base.slice(0, 60);
  }, [coins, query]);

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
          role="combobox"
          aria-expanded={open}
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
        <Command shouldFilter={false}>
          <CommandInput placeholder={placeholder} value={query} onValueChange={setQueryAndNotify} />
          <CommandList>
            {loading && coins.length === 0 ? (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Loading live coin prices…
              </div>
            ) : results.length === 0 ? (
              <CommandEmpty>No coin matches “{query}”.</CommandEmpty>
            ) : (
              <CommandGroup heading={query.trim() ? `${results.length} match${results.length === 1 ? "" : "es"}` : "Top coins by market cap"}>
                {results.map((c) => (
                  <CommandItem
                    key={c.id}
                    value={`${c.symbol} ${c.name}`}
                    onSelect={() => pick(c)}
                    onPointerDown={(e) => e.preventDefault()}
                    className="flex items-center gap-2.5"
                  >
                    <Check className={cn("size-4 shrink-0", value === c.symbol ? "opacity-100" : "opacity-0")} />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={c.image || coinLogo(c.symbol)}
                      alt={c.name}
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
                    <span className="tnum shrink-0 text-right text-sm font-semibold">{fmtPrice(c.price)}</span>
                    <span className={cn("tnum w-14 shrink-0 text-right text-[0.68rem] font-medium", pctColor(c.change24h))}>
                      {fmtPct(c.change24h)}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export default CryptoSearch;
