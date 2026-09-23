"use client";

/**
 * TickerSearch — a searchable company/ticker picker.
 *
 * Types-ahead against `/api/tickers/search`, which returns live matches across
 * ASX, NZX, NASDAQ and NYSE (the last two cover every Dow Jones component).
 * Selecting a result reports back the Yahoo symbol + company name so the caller
 * can fetch a live price. Server-driven, so cmdk's built-in filtering is off.
 *
 * When embedded inside a Dialog (Transaction Centre), Popover is modal and
 * results stay in-tree (no body portal) so Radix Dialog never sees an outside
 * click when the results panel mounts. Search/select guards keep the parent
 * dialog open through the async search lifecycle — align with the Markets path
 * (select ticker without dismissing Buy).
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
import {
  clearDialogSearchGuard,
  markDialogSearchGuard,
  markDialogSelectGuard,
  noteDialogSearchQuery,
} from "@/lib/dialog-guards";
import { isTransactionDialogOpen } from "@/lib/transaction-sticky";
import { searchMarketUniverse } from "@/lib/market-intel";

export interface TickerMatch {
  symbol: string;
  name: string;
  exchange: string;
  exchangeLabel: string;
}

function mergeTickerMatches(local: TickerMatch[], remote: TickerMatch[]): TickerMatch[] {
  const seen = new Set<string>();
  const out: TickerMatch[] = [];
  for (const m of [...local, ...remote]) {
    if (!m?.symbol || seen.has(m.symbol)) continue;
    seen.add(m.symbol);
    out.push(m);
  }
  return out;
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
  /** Inside a Dialog: keep results in-tree (no body portal) + modal popover. */
  embedInDialog = true,
  /** Optional: report live query length so the parent close-gate can hard-block. */
  onQueryChange,
}: {
  value?: string;
  label?: string; // company name to show alongside the symbol on the trigger
  onSelect: (match: TickerMatch) => void;
  placeholder?: string;
  embedInDialog?: boolean;
  onQueryChange?: (query: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<TickerMatch[]>([]);
  const [loading, setLoading] = React.useState(false);
  const seq = React.useRef(0);
  /** True from keystroke until Yahoo settles — popover must not close in that window. */
  const inFlight = React.useRef(false);

  const setQueryAndNotify = React.useCallback(
    (q: string) => {
      setQuery(q);
      noteDialogSearchQuery(q);
      onQueryChange?.(q);
    },
    [onQueryChange]
  );

  // Debounced, race-safe live search. Keep the dialog search guard armed for the
  // WHOLE popover lifetime (not cleared on fetch settle) so holdings soft-refresh
  // / live-price hydrate cannot dismiss Buy/Add after "Searching markets…".
  React.useEffect(() => {
    const q = query.trim();
    if (q.length < 1) {
      setResults([]);
      setLoading(false);
      return;
    }
    // Paint curated-universe hits immediately (BAP → BAP.AX) so the popover is
    // not stuck on "Searching markets…" until a slow Yahoo response settles —
    // that settle was dismissing Buy/Add before any match could show.
    const local = searchMarketUniverse(q);
    if (local.length) setResults(local);
    setLoading(local.length === 0);
    inFlight.current = true;
    markDialogSearchGuard(30_000);
    const id = ++seq.current;
    const t = setTimeout(async () => {
      try {
        const res = await api.get<TickerMatch[]>(`/api/tickers/search?q=${encodeURIComponent(q)}`);
        if (id !== seq.current) return; // a newer keystroke won
        const remote = res.ok && res.data ? res.data : [];
        if (!res.ok) console.error("[TickerSearch] search failed:", res.error);
        // Keep local hits if Yahoo is empty or errors — never wipe BAP back to
        // "no matches" when the network round-trip fails.
        const merged = mergeTickerMatches(local, remote);
        if (merged.length || !local.length) setResults(merged);
      } finally {
        if (id === seq.current) {
          inFlight.current = false;
          setLoading(false);
          // Re-arm (do NOT clear) — guard stays until the popover closes.
          markDialogSearchGuard(30_000);
        }
      }
    }, 280);
    return () => clearTimeout(t);
  }, [query]);

  function pick(m: TickerMatch) {
    markDialogSelectGuard();
    markDialogSearchGuard(900);
    onSelect(m);
    // Defer popover close so the parent Dialog's outside-click race settles first.
    requestAnimationFrame(() => {
      setOpen(false);
      setQueryAndNotify("");
      clearDialogSearchGuard(900);
    });
  }

  function handleOpenChange(next: boolean) {
    // Stocks-hub live-price hydrate was closing this popover as Yahoo settled,
    // while the list still said "Searching markets…". Keep it open until the
    // request finishes so local/Yahoo rows can paint.
    if (!next && inFlight.current) {
      markDialogSearchGuard(30_000);
      return;
    }
    // Never let popover open-state thrash remount the parent Dialog; only toggle
    // this local popover. Arm search guard on open; brief select+grace on close.
    if (next) {
      markDialogSearchGuard(30_000);
    } else {
      markDialogSelectGuard(450);
      clearDialogSearchGuard(900);
    }
    setOpen(next);
  }

  // If the component unmounts mid-search (stocks holdings hydrate remount),
  // keep the module-level guard armed while Buy/Add is still open. Clearing
  // it here dropped query protection before Yahoo's ~5.5s response.
  React.useEffect(() => {
    return () => {
      if (!isTransactionDialogOpen()) return;
      markDialogSelectGuard(1500);
      markDialogSearchGuard(30_000);
    };
  }, []);

  return (
    // Non-modal inside a Dialog. A modal popover fights the parent focus scope
    // and dismisses Buy/Add when the results list replaces "Searching markets…".
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
              <Search className="size-4" /> Search a company or ticker
            </span>
          )}
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        // Inside Dialog: render in-tree so Radix never treats result mount as an
        // outside click. Branch wrapper (in popover.tsx) covers body-portal cases.
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
            {loading && results.length === 0 ? (
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
                    onPointerDown={(e) => e.preventDefault()}
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
