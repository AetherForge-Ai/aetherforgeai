"use client";

/**
 * TickerSearch — a searchable company/ticker picker.
 *
 * Types-ahead against `/api/tickers/search`, which returns live matches across
 * ASX, NZX, NASDAQ and NYSE (the last two cover every Dow Jones component).
 * Selecting a result reports back the Yahoo symbol + company name so the caller
 * can fetch a live price. Server-driven, so cmdk's built-in filtering is off.
 */

import * as React from "react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

export interface TickerMatch {
  symbol: string;
  name: string;
  exchange: string;
  exchangeLabel: string;
}

const EXCHANGE_BADGE: Record<string, string> = {
  ASX: "border-amber-500/30 text-amber-500",
  NZX: "border-sky-500/30 text-sky-500",
  NASDAQ: "border-violet-500/30 text-violet-500",
  NYSE: "border-emerald-500/30 text-emerald-500",
};

export function TickerSearch({
  value,
  label,
  onSelect,
  placeholder = "Search any ASX, NZX, NASDAQ or NYSE company…",
}: {
  value?: string;
  label?: string; // company name to show alongside the symbol on the trigger
  onSelect: (match: TickerMatch) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<TickerMatch[]>([]);
  const [loading, setLoading] = React.useState(false);
  const seq = React.useRef(0);

  // Debounced, race-safe live search.
  React.useEffect(() => {
    const q = query.trim();
    if (q.length < 1) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const id = ++seq.current;
    const t = setTimeout(async () => {
      const res = await api.get<TickerMatch[]>(`/api/tickers/search?q=${encodeURIComponent(q)}`);
      if (id !== seq.current) return; // a newer keystroke won
      if (res.ok && res.data) setResults(res.data);
      else {
        console.error("[TickerSearch] search failed:", res.error);
        setResults([]);
      }
      setLoading(false);
    }, 280);
    return () => clearTimeout(t);
  }, [query]);

  function pick(m: TickerMatch) {
    onSelect(m);
    setOpen(false);
    setQuery("");
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
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
              <Search className="size-4" /> Search a company or ticker
            </span>
          )}
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder={placeholder} value={query} onValueChange={setQuery} />
          <CommandList>
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Searching markets…
              </div>
            ) : query.trim().length < 1 ? (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                Start typing a company name or ticker — e.g. <span className="font-medium">Commonwealth</span>,{" "}
                <span className="font-medium">Apple</span> or <span className="font-medium">FPH</span>.
              </div>
            ) : results.length === 0 ? (
              <CommandEmpty>No ASX, NZX, NASDAQ or NYSE match found.</CommandEmpty>
            ) : (
              <CommandGroup heading={`${results.length} match${results.length === 1 ? "" : "es"}`}>
                {results.map((m) => (
                  <CommandItem
                    key={m.symbol}
                    value={m.symbol}
                    onSelect={() => pick(m)}
                    className="flex items-center gap-2"
                  >
                    <Check className={cn("size-4", value === m.symbol ? "opacity-100" : "opacity-0")} />
                    <span className="font-display text-sm font-bold">{m.symbol}</span>
                    <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{m.name}</span>
                    <Badge
                      variant="outline"
                      className={cn("shrink-0 text-[10px]", EXCHANGE_BADGE[m.exchangeLabel] ?? "")}
                    >
                      {m.exchangeLabel}
                    </Badge>
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

export default TickerSearch;
