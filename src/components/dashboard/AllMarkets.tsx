"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { EXCHANGES, EXCHANGE_META, formatMarketPrice, type Exchange } from "@/lib/market-intel";
import { BuyDialog, type BuyTarget } from "@/components/dashboard/BuyDialog";
import { cn } from "@/lib/utils";
import {
  Globe,
  Search,
  RefreshCw,
  Loader2,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  ShoppingCart,
  Layers,
  Radio,
} from "lucide-react";

interface Row {
  ticker: string;
  symbol: string;
  name: string;
  sector: string;
  exchange: Exchange;
  currency: "NZD" | "AUD" | "USD";
  price: number;
  changePct: number;
  volume: number | null;
  live: boolean;
}

interface Payload {
  exchange: Exchange;
  label: string;
  sub: string;
  currency: "NZD" | "AUD" | "USD";
  live: boolean;
  liveCount: number;
  total: number;
  asOf: string;
  rows: Row[];
}

type SortKey = "symbol" | "price" | "changePct" | "volume";

const volFmt = new Intl.NumberFormat("en-NZ", { notation: "compact", maximumFractionDigits: 1 });

function fmtVolume(v: number | null): string {
  return v && v > 0 ? volFmt.format(v) : "—";
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-NZ", { hour: "2-digit", minute: "2-digit" });
}

export function AllMarkets({ onBought }: { onBought?: () => void }) {
  const [open, setOpen] = useState(false);
  const [exchange, setExchange] = useState<Exchange>("NASDAQ");
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("changePct");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [buyTarget, setBuyTarget] = useState<BuyTarget | null>(null);
  const [buyOpen, setBuyOpen] = useState(false);

  const load = useCallback(async (ex: Exchange) => {
    setLoading(true);
    console.log(`[all-markets] Loading live list for ${ex}…`);
    const res = await api.get<Payload>(`/api/all-markets?exchange=${ex}&t=${Date.now()}`);
    if (res.ok && res.data) {
      setData(res.data);
      console.log(`[all-markets] ${ex}: ${res.data.liveCount}/${res.data.total} live`);
    } else {
      console.error("[all-markets] Load failed:", res.error);
      setData(null);
    }
    setLoading(false);
  }, []);

  // Load whenever the modal opens or the exchange changes while open.
  useEffect(() => {
    if (open) load(exchange);
  }, [open, exchange, load]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "symbol" ? "asc" : "desc");
    }
  }

  const rows = useMemo(() => {
    const all = data?.rows ?? [];
    const q = query.trim().toLowerCase();
    const filtered = q
      ? all.filter((r) => r.symbol.toLowerCase().includes(q) || r.name.toLowerCase().includes(q))
      : all;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sortKey === "symbol") return a.symbol.localeCompare(b.symbol) * dir;
      if (sortKey === "volume") return ((a.volume ?? 0) - (b.volume ?? 0)) * dir;
      return ((a[sortKey] as number) - (b[sortKey] as number)) * dir;
    });
  }, [data, query, sortKey, sortDir]);

  function openBuy(r: Row) {
    setBuyTarget({ ticker: r.ticker, name: r.name, assetType: "stock", price: r.price });
    setBuyOpen(true);
  }

  const SortHead = ({ label, k, align = "right" }: { label: string; k: SortKey; align?: "left" | "right" }) => (
    <button
      onClick={() => toggleSort(k)}
      className={cn(
        "flex w-full items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground",
        align === "right" ? "justify-end" : "justify-start"
      )}
    >
      {label}
      {sortKey === k ? (
        sortDir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />
      ) : (
        <ArrowUpDown className="size-3 opacity-40" />
      )}
    </button>
  );

  return (
    <section>
      {/* Prominent dashboard card — opens the ALL Markets view */}
      <button
        onClick={() => setOpen(true)}
        className="group flex w-full items-center gap-4 rounded-3xl border border-primary/30 bg-gradient-to-br from-primary/12 via-card/60 to-card/50 p-6 text-left shadow-glow transition-colors hover:border-primary/50"
      >
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary/15 text-primary">
          <Globe className="size-6" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="font-display text-lg font-bold">ALL Markets</h2>
            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider text-emerald-300">
              ● Live
            </span>
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Browse every live ticker on NZX · ASX · Dow Jones · NASDAQ — price, % change &amp; volume.
          </p>
        </div>
        <span className="hidden shrink-0 items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-transform group-hover:scale-[1.03] sm:inline-flex">
          <Layers className="size-4" /> Open Market Snapshot
        </span>
      </button>

      {/* ALL Markets modal */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[90vh] max-w-4xl flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b border-border/60 px-6 py-4">
            <DialogTitle className="flex items-center gap-2 font-display text-xl">
              <Globe className="size-5 text-primary" /> ALL Markets
            </DialogTitle>
            <DialogDescription>
              Live prices across every exchange. Pick a market, search, sort — then buy in one click.
            </DialogDescription>
          </DialogHeader>

          {/* Exchange selector */}
          <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-6 py-3">
            {EXCHANGES.map((ex) => {
              const active = ex === exchange;
              return (
                <button
                  key={ex}
                  onClick={() => setExchange(ex)}
                  className={cn(
                    "rounded-xl border px-3.5 py-2 text-sm font-semibold transition-colors",
                    active
                      ? "border-primary bg-primary text-primary-foreground shadow-glow"
                      : "border-border/60 bg-background/40 text-muted-foreground hover:text-foreground"
                  )}
                >
                  {EXCHANGE_META[ex].label}
                </button>
              );
            })}
            <div className="ml-auto flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => load(exchange)} disabled={loading}>
                {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
              </Button>
            </div>
          </div>

          {/* Search + status */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3">
            <div className="relative w-full max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search ticker or company…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Radio className="size-3.5 text-emerald-400" />
              {data
                ? `${rows.length} of ${data.total} · ${data.liveCount} live · ${fmtTime(data.asOf)}`
                : "—"}
            </p>
          </div>

          {/* Table */}
          <div className="flex-1 overflow-y-auto px-6 pb-6">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-card">
                <tr className="border-b border-border/60">
                  <th className="py-2.5 pr-3 text-left"><SortHead label="Ticker" k="symbol" align="left" /></th>
                  <th className="hidden py-2.5 pr-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground sm:table-cell">
                    Company
                  </th>
                  <th className="py-2.5 px-3"><SortHead label="Price" k="price" /></th>
                  <th className="py-2.5 px-3"><SortHead label="Change" k="changePct" /></th>
                  <th className="hidden py-2.5 px-3 md:table-cell"><SortHead label="Volume" k="volume" /></th>
                  <th className="py-2.5 pl-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Buy
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  [...Array(10)].map((_, i) => (
                    <tr key={i} className="border-b border-border/30">
                      <td colSpan={6} className="py-2">
                        <div className="h-8 animate-pulse rounded-lg bg-muted/40" />
                      </td>
                    </tr>
                  ))
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-sm text-muted-foreground">
                      No tickers match “{query}”.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => {
                    const up = r.changePct >= 0;
                    return (
                      <tr key={r.ticker} className="border-b border-border/30 last:border-0 hover:bg-background/40">
                        <td className="py-2.5 pr-3">
                          <div className="flex items-center gap-2">
                            <span className="font-display font-semibold">{r.symbol}</span>
                            {!r.live && (
                              <span className="rounded bg-muted/60 px-1 py-0.5 text-[0.55rem] font-semibold uppercase text-muted-foreground">
                                ref
                              </span>
                            )}
                          </div>
                          <span className="text-[0.66rem] text-muted-foreground sm:hidden">{r.name}</span>
                        </td>
                        <td className="hidden max-w-[16rem] truncate py-2.5 pr-3 text-muted-foreground sm:table-cell">
                          {r.name}
                        </td>
                        <td className="tnum py-2.5 px-3 text-right font-medium">
                          {formatMarketPrice(r.price, r.currency)}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <span
                            className={cn(
                              "tnum inline-flex items-center justify-end gap-0.5 font-semibold",
                              up ? "text-emerald-400" : "text-rose-400"
                            )}
                          >
                            {up ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
                            {Math.abs(r.changePct).toFixed(2)}%
                          </span>
                        </td>
                        <td className="tnum hidden py-2.5 px-3 text-right text-muted-foreground md:table-cell">
                          {fmtVolume(r.volume)}
                        </td>
                        <td className="py-2.5 pl-3 text-right">
                          <Button size="sm" variant="outline" className="h-8 px-2.5" onClick={() => openBuy(r)}>
                            <ShoppingCart className="size-3.5 sm:mr-1.5" />
                            <span className="hidden sm:inline">Buy</span>
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>

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
