"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { EXCHANGES, EXCHANGE_META, formatMarketPrice, type Exchange } from "@/lib/market-intel";
import { BuyDialog, type BuyTarget } from "@/components/dashboard/BuyDialog";
import { StockDetailDialog, type DetailTarget } from "@/components/dashboard/StockDetailDialog";
import { cn } from "@/lib/utils";
import {
  Search,
  RefreshCw,
  Loader2,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  ShoppingCart,
  Radio,
  Clock,
} from "lucide-react";

export interface MarketRow {
  ticker: string;
  symbol: string;
  name: string;
  sector: string;
  exchange: Exchange;
  currency: "NZD" | "AUD" | "USD";
  price: number;
  changePct: number;
  changeAbs: number;
  dayHigh: number | null;
  dayLow: number | null;
  volume: number | null;
  marketCap: number | null;
  live: boolean;
}

export interface MarketPayload {
  exchange: Exchange;
  label: string;
  sub: string;
  currency: "NZD" | "AUD" | "USD";
  live: boolean;
  liveCount: number;
  total: number;
  asOf: string;
  rows: MarketRow[];
}

type SortKey = "symbol" | "price" | "changePct" | "volume" | "marketCap";

const volFmt = new Intl.NumberFormat("en-NZ", { notation: "compact", maximumFractionDigits: 1 });

function fmtVolume(v: number | null): string {
  return v && v > 0 ? volFmt.format(v) : "—";
}

/** Compact market-cap / currency figure, e.g. "$1.2T", "$948.6B". */
function fmtCap(v: number | null, currency: string): string {
  if (!v || v <= 0) return "—";
  const sym = currency === "USD" ? "$" : currency === "AUD" ? "A$" : "NZ$";
  const abs = Math.abs(v);
  const unit = abs >= 1e12 ? ["T", 1e12] : abs >= 1e9 ? ["B", 1e9] : abs >= 1e6 ? ["M", 1e6] : ["", 1];
  return `${sym}${(v / (unit[1] as number)).toFixed(abs >= 1e9 ? 2 : 1)}${unit[0]}`;
}

/** A signed price move like "+0.42" / "−1.18" (session change in absolute terms). */
function fmtAbs(v: number, price: number): string {
  const dp = price < 5 ? 4 : 2;
  const sign = v > 0 ? "+" : v < 0 ? "−" : "";
  return `${sign}${Math.abs(v).toFixed(dp)}`;
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-NZ", { hour: "2-digit", minute: "2-digit" });
}

/**
 * Shared live cross-exchange market browser — the sortable / searchable table
 * of every ticker on the selected exchange (NZX · ASX · Dow Jones · NASDAQ) with
 * live price, % change and volume, plus a one-click Buy.
 *
 * Used both inside the dashboard "ALL Markets" modal and as the full-page
 * `/markets` (Stock Markets) view, so the two never drift apart.
 *
 * Data comes from GET /api/all-markets (keyless live Yahoo Finance server-side).
 */
export function MarketsExplorer({
  onBought,
  active = true,
  className,
}: {
  onBought?: () => void;
  /** When false the component skips fetching (e.g. modal is closed). */
  active?: boolean;
  className?: string;
}) {
  const [exchange, setExchange] = useState<Exchange>("NASDAQ");
  const [data, setData] = useState<MarketPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("changePct");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [buyTarget, setBuyTarget] = useState<BuyTarget | null>(null);
  const [buyOpen, setBuyOpen] = useState(false);
  const [detailTarget, setDetailTarget] = useState<DetailTarget | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // `silent` refresh keeps the current rows on screen (no skeleton flash) — used
  // by the 30–60s auto-refresh so prices update seamlessly, live-ticker style.
  const load = useCallback(async (ex: Exchange, silent = false) => {
    if (!silent) setLoading(true);
    console.log(`[markets-explorer] Loading live list for ${ex}…${silent ? " (auto)" : ""}`);
    const res = await api.get<MarketPayload>(`/api/all-markets?exchange=${ex}&t=${Date.now()}`);
    if (res.ok && res.data) {
      setData(res.data);
      console.log(`[markets-explorer] ${ex}: ${res.data.liveCount}/${res.data.total} live`);
    } else {
      console.error("[markets-explorer] Load failed:", res.error);
      if (!silent) setData(null);
    }
    if (!silent) setLoading(false);
  }, []);

  // Load whenever active + exchange changes.
  useEffect(() => {
    if (active) load(exchange);
  }, [active, exchange, load]);

  // Auto-refresh live prices every 45s while the browser is open — no skeleton
  // flash, just fresh numbers. Paused when the modal/section is inactive.
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => load(exchange, true), 45_000);
    return () => clearInterval(id);
  }, [active, exchange, load]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
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
      if (sortKey === "marketCap") return ((a.marketCap ?? 0) - (b.marketCap ?? 0)) * dir;
      return ((a[sortKey] as number) - (b[sortKey] as number)) * dir;
    });
  }, [data, query, sortKey, sortDir]);

  function openBuy(r: MarketRow) {
    setBuyTarget({ ticker: r.ticker, name: r.name, assetType: "stock", price: r.price });
    setBuyOpen(true);
  }

  function openDetail(r: MarketRow) {
    setDetailTarget({
      symbol: r.symbol,
      ticker: r.ticker,
      name: r.name,
      exchange: r.exchange,
      currency: r.currency,
    });
    setDetailOpen(true);
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
    <div className={cn("flex min-h-0 flex-col", className)}>
      {/* Exchange selector */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-1 pb-3">
        {EXCHANGES.map((ex) => {
          const activeEx = ex === exchange;
          return (
            <button
              key={ex}
              onClick={() => setExchange(ex)}
              className={cn(
                "rounded-xl border px-3.5 py-2 text-sm font-semibold transition-colors",
                activeEx
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
      <div className="flex flex-wrap items-center justify-between gap-3 px-1 py-3">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search ticker or company…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex flex-col items-end gap-0.5">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Radio className="size-3.5 text-emerald-400" />
            {data ? `${rows.length} of ${data.total} · ${data.liveCount} live · ${fmtTime(data.asOf)}` : "—"}
          </p>
          {exchange === "NZX" && (
            <p className="flex items-center gap-1 text-[0.62rem] text-muted-foreground/80">
              <Clock className="size-3" /> NZX quotes may be delayed ~20 min
            </p>
          )}
        </div>
      </div>

      {/* Table — scrolls on BOTH axes so wide rows never push the page sideways on mobile */}
      <div className="min-h-0 flex-1 overflow-auto px-1 pb-2">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-card">
            <tr className="border-b border-border/60">
              <th className="py-2.5 pr-3 text-left"><SortHead label="Ticker" k="symbol" align="left" /></th>
              <th className="hidden py-2.5 pr-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground sm:table-cell">
                Company
              </th>
              <th className="py-2.5 px-3"><SortHead label="Price" k="price" /></th>
              <th className="py-2.5 px-3"><SortHead label="Change" k="changePct" /></th>
              <th className="hidden py-2.5 px-3 lg:table-cell text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                High
              </th>
              <th className="hidden py-2.5 px-3 lg:table-cell text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Low
              </th>
              <th className="hidden py-2.5 px-3 md:table-cell"><SortHead label="Volume" k="volume" /></th>
              <th className="hidden py-2.5 px-3 xl:table-cell"><SortHead label="Mkt Cap" k="marketCap" /></th>
              <th className="py-2.5 pl-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Buy
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              [...Array(12)].map((_, i) => (
                <tr key={i} className="border-b border-border/30">
                  <td colSpan={9} className="py-2">
                    <div className="h-8 animate-pulse rounded-lg bg-muted/40" />
                  </td>
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-12 text-center text-sm text-muted-foreground">
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
                        {/* Clickable ticker → detailed stock view (chart, stats, AI) */}
                        <button
                          onClick={() => openDetail(r)}
                          className="font-display font-semibold text-primary underline-offset-4 transition-colors hover:text-primary hover:underline"
                          title={`View ${r.symbol} details`}
                        >
                          {r.symbol}
                        </button>
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
                      {/* Absolute session move ($) beneath the % — both requested */}
                      <span className={cn("tnum block text-[0.62rem]", up ? "text-emerald-400/70" : "text-rose-400/70")}>
                        {r.live ? fmtAbs(r.changeAbs, r.price) : "—"}
                      </span>
                    </td>
                    <td className="tnum hidden py-2.5 px-3 text-right text-muted-foreground lg:table-cell">
                      {r.dayHigh ? formatMarketPrice(r.dayHigh, r.currency) : "—"}
                    </td>
                    <td className="tnum hidden py-2.5 px-3 text-right text-muted-foreground lg:table-cell">
                      {r.dayLow ? formatMarketPrice(r.dayLow, r.currency) : "—"}
                    </td>
                    <td className="tnum hidden py-2.5 px-3 text-right text-muted-foreground md:table-cell">
                      {fmtVolume(r.volume)}
                    </td>
                    <td className="tnum hidden py-2.5 px-3 text-right text-muted-foreground xl:table-cell">
                      {fmtCap(r.marketCap, r.currency)}
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

      <BuyDialog
        open={buyOpen}
        onOpenChange={setBuyOpen}
        target={buyTarget}
        onDone={() => {
          setBuyOpen(false);
          onBought?.();
        }}
      />

      {/* Detailed stock view — chart, key stats & Stox AI analysis pane */}
      <StockDetailDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        target={detailTarget}
        canBuy={!!onBought}
        onBought={onBought}
      />
    </div>
  );
}
