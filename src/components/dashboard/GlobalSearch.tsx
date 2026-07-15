"use client";

/**
 * Global search command palette (⌘K / Ctrl+K). Searches the entire cross-market
 * universe — equities (NZX/ASX/US) and crypto — by ticker or name. Picking a
 * result switches to the matching bot and adds the symbol to the watchlist.
 */

import * as React from "react";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { universeFor, type AssetClass, type UniverseEntry } from "@/lib/market-intel";
import { Search, TrendingUp, Bitcoin } from "lucide-react";

export function GlobalSearch({
  onPick,
}: {
  onPick: (assetClass: AssetClass, entry: UniverseEntry) => void;
}) {
  const [open, setOpen] = React.useState(false);

  const stocks = React.useMemo(() => universeFor("stock"), []);
  const cryptos = React.useMemo(() => universeFor("crypto"), []);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  function handleSelect(assetClass: AssetClass, entry: UniverseEntry) {
    console.log(`[GlobalSearch] Picked ${entry.ticker} (${assetClass})`);
    setOpen(false);
    onPick(assetClass, entry);
  }

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        className="gap-2 text-muted-foreground"
      >
        <Search className="size-4" />
        <span className="hidden sm:inline">Search markets</span>
        <kbd className="ml-1 hidden rounded border border-border/60 bg-muted/60 px-1.5 py-0.5 text-[0.6rem] font-semibold sm:inline">
          ⌘K
        </kbd>
      </Button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Search tickers, coins or companies…" />
        <CommandList>
          <CommandEmpty>No matching securities found.</CommandEmpty>
          <CommandGroup heading="Equities · NZX · ASX · US">
            {stocks.map((e) => (
              <CommandItem
                key={`stock-${e.ticker}`}
                value={`${e.ticker} ${e.name}`}
                onSelect={() => handleSelect("stock", e)}
              >
                <TrendingUp className="mr-2 size-4 text-emerald-600" />
                <span className="font-semibold">{e.ticker.replace(/\.(NZ|AX)$/, "")}</span>
                <span className="ml-2 truncate text-muted-foreground">{e.name}</span>
                <span className="ml-auto text-[0.62rem] uppercase text-muted-foreground">{e.market}</span>
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandGroup heading="Crypto · Digital assets">
            {cryptos.map((e) => (
              <CommandItem
                key={`crypto-${e.ticker}`}
                value={`${e.ticker} ${e.name}`}
                onSelect={() => handleSelect("crypto", e)}
              >
                <Bitcoin className="mr-2 size-4 text-amber-600" />
                <span className="font-semibold">{e.ticker}</span>
                <span className="ml-2 truncate text-muted-foreground">{e.name}</span>
                <span className="ml-auto text-[0.62rem] uppercase text-muted-foreground">Crypto</span>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
