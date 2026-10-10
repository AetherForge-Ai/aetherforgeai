"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { EXCHANGES, EXCHANGE_META, formatMarketPrice, type Exchange } from "@/lib/market-intel";
import { BuyDialog, type BuyTarget } from "@/components/dashboard/BuyDialog";
import { cryptoCoveragePhrase } from "@/lib/crypto-coverage";
import { explorerDetailHref, marketsTabHref, type MarketsTab } from "@/lib/market-detail-routes";
import { useCryptoMarkets } from "@/hooks/useCryptoMarkets";
import { coinHasLivePrice, fmtPrice } from "@/lib/crypto-market";
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
  Bitcoin,
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
  quoted?: boolean;
  freshness?: string;
}

export interface MarketPayload {
  exchange: Exchange;
  label: string;
  sub: string;
  currency: "NZD" | "AUD" | "USD";
  live: boolean;
  liveCount: number;
  total: number;
  asOf: string | null;
  freshness?: string;
  rows: MarketRow[];
}

type SortKey = "symbol" | "price" | "changePct" | "volume" | "marketCap";

/** A tab is either a stock exchange or the live crypto universe. */
type Tab = MarketsTab;

/**
 * Normalized row rendered by the table — stock rows (from /api/all-markets) and
 * crypto rows (from the top-500 Swyftx universe) are both mapped into this shape
 * so a single table, sort and search cover every asset class.
 */
interface DisplayRow {
  key: string;
  ticker: string; // internal ticker used for a Buy (e.g. BHP.AX or BTC)
  symbol: string; // display symbol
  name: string;
  currency: "NZD" | "AUD" | "USD";
  price: number;
  changePct: number;
  changeAbs: number;
  dayHigh: number | null;
  dayLow: number | null;
  volume: number | null;
  marketCap: number | null;
  live: boolean;
  quoted: boolean;
  exchange?: Exchange; // stock rows only — needed to open the stock detail view
  coinId?: string; // crypto rows only — CoinGecko id for /markets/crypto/[id]
  blockchain?: string;
  priceUnavailable?: boolean;
}

/** Crypto tab shows the CoinGecko top 400 by market cap, 25 per page. */
const CRYPTO_TOP_N = 400;
const CRYPTO_PAGE_SIZE = 25;

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
  allowBuy = true,
  initialTab = null,
  syncTab = false,
}: {
  onBought?: () => void;
  /** When false the component skips fetching (e.g. modal is closed). */
  active?: boolean;
  className?: string;
  /** Public /markets hides the Buy column. Dashboard paper-trade keeps it. */
  allowBuy?: boolean;
  /** From /markets?tab= so a detail page can return to the same board. */
  initialTab?: Tab | null;
  /** Write the selected tab into the /markets query. Off inside the dashboard modal. */
  syncTab?: boolean;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(initialTab ?? "NASDAQ");
  const [data, setData] = useState<MarketPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("changePct");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [buyTarget, setBuyTarget] = useState<BuyTarget | null>(null);
  const [buyOpen, setBuyOpen] = useState(false);
  /** Live Yahoo matches for tickers outside the curated exchange list (e.g. CIP.AX). */
  const [remoteHits, setRemoteHits] = useState<DisplayRow[]>([]);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [cryptoPage, setCryptoPage] = useState(0);
  const loadGen = useRef(0);

  const isCryptoTab = tab === "CRYPTO";

  useEffect(() => {
    if (initialTab) setTab(initialTab);
  }, [initialTab]);

  function selectTab(next: Tab) {
    if (next !== tab) {
      // Invalidate an in-flight quote before the next load() starts, so the
      // previous exchange cannot paint under the new tab.
      loadGen.current += 1;
      setData(null);
      setLoadError(null);
      setRemoteHits([]);
      if (next !== "CRYPTO") setLoading(true);
    }
    setTab(next);
    if (!syncTab) return;
    router.replace(marketsTabHref(next), { scroll: false });
  }

  // CoinGecko top 400. A missing print stays unavailable. Shares the cached store.
  const crypto = useCryptoMarkets(active && isCryptoTab);

  // `silent` refresh keeps the current rows on screen (no skeleton flash) — used
  // by the 30–60s auto-refresh so prices update seamlessly, live-ticker style.
  const load = useCallback(async (ex: Exchange, silent = false) => {
    const gen = ++loadGen.current;
    if (!silent) {
      setLoading(true);
      setData(null);
      setLoadError(null);
    }
    console.log(`[markets-explorer] Loading prices for ${ex}…${silent ? " (auto)" : ""}`);
    try {
      const res = await api.get<MarketPayload>(`/api/all-markets?exchange=${ex}&t=${Date.now()}`, {
        signal: AbortSignal.timeout(20_000),
      });
      if (gen !== loadGen.current) return;
      if (res.data?.exchange && res.data.exchange !== ex) return;
      if (res.ok && res.data?.rows?.length) {
        setData(res.data);
        setLoadError(null);
        console.log(`[markets-explorer] ${ex}: ${res.data.liveCount}/${res.data.total} quoted`);
      } else {
        console.error("[markets-explorer] Load failed:", res.error);
        if (!silent) {
          setData(null);
          setLoadError("Market prices failed to load.");
        }
      }
    } catch (err) {
      if (gen !== loadGen.current) return;
      console.error("[markets-explorer] Load failed:", err);
      if (!silent) {
        setData(null);
        setLoadError("Market prices failed to load.");
      }
    }
    if (gen === loadGen.current && !silent) setLoading(false);
  }, []);

  // Load stock exchange data whenever active + a stock tab is selected. (Crypto
  // is handled by the useCryptoMarkets hook above.)
  useEffect(() => {
    if (active && !isCryptoTab) load(tab as Exchange);
  }, [active, tab, isCryptoTab, load]);

  // Auto-refresh live stock prices every 45s while the browser is open — no
  // skeleton flash, just fresh numbers. Paused when inactive or on the crypto tab.
  useEffect(() => {
    if (!active || isCryptoTab) return;
    const id = setInterval(() => load(tab as Exchange, true), 45_000);
    return () => clearInterval(id);
  }, [active, tab, isCryptoTab, load]);

  // When the local curated list misses a ticker (e.g. CIP.AX), resolve via Yahoo
  // symbol search so Buy still appears for any ASX/NZX/US listing.
  useEffect(() => {
    if (!active || isCryptoTab) {
      setRemoteHits([]);
      return;
    }
    const q = query.trim();
    if (q.length < 1) {
      setRemoteHits([]);
      setRemoteLoading(false);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      setRemoteLoading(true);
      const res = await api.get<
        { symbol: string; name: string; exchange: string; exchangeLabel: string }[]
      >(`/api/tickers/search?q=${encodeURIComponent(q)}`);
      if (cancelled) return;
      setRemoteLoading(false);
      if (!res.ok || !res.data) {
        setRemoteHits([]);
        return;
      }
      const tabLabel =
        tab === "ASX" ? "ASX" : tab === "NZX" ? "NZX" : tab === "NASDAQ" ? "NASDAQ" : tab === "DOW" ? "NYSE" : "";
      const qUp = q.toUpperCase();
      const mapped: DisplayRow[] = [];
      for (const m of res.data) {
        const label = (m.exchangeLabel || "").toUpperCase();
        const sym = (m.symbol || "").toUpperCase();
        const bare = sym.replace(/\.(AX|NZ)$/i, "");
        const exactHit =
          sym === qUp || bare === qUp || sym.startsWith(qUp) || bare.startsWith(qUp);
        const onTab = !tabLabel || label === tabLabel || (tab === "DOW" && label === "NYSE");
        // Always surface exact ticker hits (CIP / CIP.AX) even off-tab; otherwise keep tab matches.
        if (!exactHit && !onTab) continue;
        const currency = label === "ASX" ? "AUD" : label === "NZX" ? "NZD" : "USD";
        const exchange = (
          label === "ASX" ? "ASX" : label === "NZX" ? "NZX" : label === "NASDAQ" ? "NASDAQ" : "DOW"
        ) as Exchange;
        mapped.push({
          key: `remote:${sym}`,
          ticker: sym,
          symbol: bare,
          name: m.name || sym,
          currency,
          price: 0,
          changePct: 0,
          changeAbs: 0,
          dayHigh: null,
          dayLow: null,
          volume: null,
          marketCap: null,
          live: false,
          quoted: false,
          exchange,
        });
      }
      setRemoteHits(mapped);
      // Best-effort live quote for the top few remote hits so Buy has a price.
      for (const row of mapped.slice(0, 6)) {
        void (async () => {
          const qr = await api.get<{ price: number | null; changePct?: number | null }>(
            `/api/tickers/quote?symbol=${encodeURIComponent(row.ticker)}&type=stock`
          );
          if (cancelled || !qr.ok || !qr.data?.price) return;
          setRemoteHits((prev) =>
            prev.map((r) =>
              r.ticker === row.ticker
                ? {
                    ...r,
                    price: qr.data!.price!,
                    changePct: qr.data!.changePct ?? 0,
                    live: false,
                    quoted: true,
                  }
                : r
            )
          );
        })();
      }
    }, 320);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [active, isCryptoTab, query, tab]);

  function refresh() {
    if (isCryptoTab) crypto.refresh();
    else load(tab as Exchange);
  }

  useEffect(() => {
    setCryptoPage(0);
  }, [tab, query, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "symbol" ? "asc" : "desc");
    }
  }

  // Normalize the active data source (stock exchange OR crypto) into DisplayRow[].
  const rows = useMemo<DisplayRow[]>(() => {
    let all: DisplayRow[];
    if (isCryptoTab) {
      const top = [...crypto.coins]
        .filter((c) => coinHasLivePrice(c))
        .sort((a, b) => (a.rank ?? 999999) - (b.rank ?? 999999))
        .slice(0, CRYPTO_TOP_N);
      all = top.map((c) => ({
        key: c.id,
        ticker: c.symbol.toUpperCase(),
        symbol: c.symbol.toUpperCase(),
        name: c.name,
        currency: "USD",
        price: c.price,
        changePct: c.change24h ?? 0,
        changeAbs: (c.price * (c.change24h ?? 0)) / 100,
        dayHigh: c.high24h,
        dayLow: c.low24h,
        volume: c.volume24h > 0 ? c.volume24h : null,
        marketCap: c.marketCap > 0 ? c.marketCap : null,
        live: !c.priceUnavailable && c.price > 0,
        quoted: !c.priceUnavailable && c.price > 0,
        coinId: c.id,
        blockchain: c.blockchain && c.blockchain !== "Unavailable" ? c.blockchain : "",
        priceUnavailable: !!c.priceUnavailable || !(c.price > 0),
      }));
    } else {
      all = (data?.rows ?? []).map((r) => ({
        key: r.ticker,
        ticker: r.ticker,
        symbol: r.symbol,
        name: r.name,
        currency: r.currency,
        price: r.price,
        changePct: r.changePct,
        changeAbs: r.changeAbs,
        dayHigh: r.dayHigh,
        dayLow: r.dayLow,
        volume: r.volume,
        marketCap: r.marketCap,
        live: r.live,
        quoted: r.quoted ?? r.price > 0,
        exchange: r.exchange,
      }));
    }
    const q = query.trim().toLowerCase();
    const filtered = q
      ? all.filter((r) => r.symbol.toLowerCase().includes(q) || r.name.toLowerCase().includes(q) || r.ticker.toLowerCase().includes(q))
      : all;
    // Merge Yahoo remote hits that are not already in the curated list.
    const seen = new Set(filtered.map((r) => r.ticker.toUpperCase()));
    const extras = !isCryptoTab && q
      ? remoteHits.filter((r) => !seen.has(r.ticker.toUpperCase()))
      : [];
    const merged = extras.length ? [...extras, ...filtered] : filtered;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...merged].sort((a, b) => {
      if (sortKey === "symbol") return a.symbol.localeCompare(b.symbol) * dir;
      if (sortKey === "volume") return ((a.volume ?? 0) - (b.volume ?? 0)) * dir;
      if (sortKey === "marketCap") return ((a.marketCap ?? 0) - (b.marketCap ?? 0)) * dir;
      return ((a[sortKey] as number) - (b[sortKey] as number)) * dir;
    });
  }, [isCryptoTab, crypto.coins, data, query, sortKey, sortDir, remoteHits]);

  // Live-price formatter — crypto needs micro-price precision, stocks are currency-aware.
  const showPrice = (r: DisplayRow) =>
    r.priceUnavailable ? "—" : r.coinId ? fmtPrice(r.price) : formatMarketPrice(r.price, r.currency);

  // Unified loading + status across both data sources.
  const loadingRows = isCryptoTab ? crypto.loading : loading;
  const stockLoading = !isCryptoTab && loading;
  const cryptoListed = Math.min(CRYPTO_TOP_N, crypto.coins.length);
  const total = isCryptoTab ? cryptoListed : data?.total ?? 0;
  const liveCount = isCryptoTab ? cryptoListed : data?.liveCount ?? 0;
  const asOf = isCryptoTab ? "" : data?.asOf ?? "";
  const hasData = isCryptoTab ? crypto.coins.length > 0 : !!data;
  const cryptoPageCount = Math.max(1, Math.ceil(rows.length / CRYPTO_PAGE_SIZE));
  const cryptoPageSafe = Math.min(cryptoPage, cryptoPageCount - 1);
  const visibleRows = isCryptoTab
    ? rows.slice(cryptoPageSafe * CRYPTO_PAGE_SIZE, cryptoPageSafe * CRYPTO_PAGE_SIZE + CRYPTO_PAGE_SIZE)
    : rows;
  const showHigh = !isCryptoTab || rows.some((r) => (r.dayHigh ?? 0) > 0);
  const showLow = !isCryptoTab || rows.some((r) => (r.dayLow ?? 0) > 0);
  const showVolume = !isCryptoTab || rows.some((r) => (r.volume ?? 0) > 0);
  const showCap = !isCryptoTab || rows.some((r) => (r.marketCap ?? 0) > 0);
  const showChain = isCryptoTab && rows.some((r) => !!r.blockchain);
  const colSpan = 4 + Number(showHigh) + Number(showLow) + Number(showVolume) + Number(showCap) + Number(showChain) + Number(allowBuy);

  function openBuy(r: DisplayRow) {
    setBuyTarget({ ticker: r.ticker, name: r.name, assetType: r.coinId ? "crypto" : "stock", price: r.price });
    setBuyOpen(true);
  }

  function detailHref(r: DisplayRow): string {
    return explorerDetailHref(
      {
        coinId: r.coinId,
        ticker: r.ticker,
        symbol: r.symbol,
        name: r.name,
        exchange: r.exchange ?? null,
      },
      {
        buy: allowBuy,
        asset: r.coinId || isCryptoTab ? "crypto" : "stock",
        fallbackExchange: !r.coinId && !isCryptoTab ? (tab as Exchange) : null,
      }
    );
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
      {/* Exchange / asset-class selector */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-1 pb-3">
        {EXCHANGES.map((ex) => {
          const activeEx = ex === tab;
          return (
            <button
              key={ex}
              onClick={() => selectTab(ex)}
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
        {/* Crypto coverage is the row count, rounded, not the fetch size. */}
        <button
          onClick={() => selectTab("CRYPTO")}
          className={cn(
            "flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-sm font-semibold transition-colors",
            isCryptoTab
              ? "border-primary bg-primary text-primary-foreground shadow-glow"
              : "border-border/60 bg-background/40 text-muted-foreground hover:text-foreground"
          )}
        >
          <Bitcoin className="size-4" /> Crypto
        </button>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={refresh} disabled={loadingRows}>
            {loadingRows ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
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
            <Radio className={cn("size-3.5", liveCount > 0 ? "text-emerald-600" : "text-muted-foreground")} />
            {(isCryptoTab ? crypto.error : loadError)
              ? (isCryptoTab ? crypto.error : loadError)
              : stockLoading
              ? "Loading prices…"
              : hasData || remoteHits.length
              ? `${rows.length} of ${total}${remoteLoading ? " · searching…" : ""}${remoteHits.length && query.trim() ? ` · +${remoteHits.length} market match${remoteHits.length === 1 ? "" : "es"}` : ""}${liveCount > 0 ? ` · ${liveCount} quoted` : " · reference prices"}${asOf ? ` · ${fmtTime(asOf)}` : ""}`
              : loadingRows
                ? "Loading prices…"
                : "—"}
          </p>
          {!isCryptoTab && !stockLoading && data && (
            <p className="flex items-center gap-1 text-[0.62rem] text-muted-foreground/80">
              <Clock className="size-3" /> {data.freshness || "Latest available price"}
            </p>
          )}
          {isCryptoTab && (
            <p className="flex items-center gap-1 text-[0.62rem] text-muted-foreground/80">
              <Bitcoin className="size-3" /> {cryptoCoveragePhrase(cryptoListed)} · USD
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
              {showHigh && (
              <th className="hidden py-2.5 px-3 lg:table-cell text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                High
              </th>
              )}
              {showLow && (
              <th className="hidden py-2.5 px-3 lg:table-cell text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Low
              </th>
              )}
              {showVolume && (
              <th className="hidden py-2.5 px-3 md:table-cell"><SortHead label="Volume" k="volume" /></th>
              )}
              {showCap && (
              <th className="hidden py-2.5 px-3 xl:table-cell"><SortHead label="Mkt Cap" k="marketCap" /></th>
              )}
              {showChain && (
                <th className="py-2.5 pl-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Blockchain
                </th>
              )}
              {allowBuy && (
                <th className="py-2.5 pl-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Buy
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {stockLoading || (isCryptoTab && crypto.loading && rows.length === 0) ? (
              [...Array(12)].map((_, i) => (
                <tr key={i} className="border-b border-border/30">
                  <td colSpan={colSpan} className="py-2">
                    <div className="h-8 animate-pulse rounded-lg bg-muted/40" />
                  </td>
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={colSpan} className="py-12 text-center text-sm text-muted-foreground">
                  {query
                    ? `No tickers match “${query}”.`
                    : isCryptoTab
                      ? "No live crypto prices right now."
                      : loadError
                        ? "Market prices failed to load. Use refresh to try again."
                        : "No rows returned for this market."}
                </td>
              </tr>
            ) : (
              visibleRows.map((r) => {
                const up = r.changePct >= 0;
                return (
                  <tr key={r.key} className="border-b border-border/30 last:border-0 hover:bg-background/40">
                    <td className="py-2.5 pr-3">
                      <div className="flex items-center gap-2">
                        <Link
                          href={detailHref(r)}
                          className="font-display font-semibold text-primary underline-offset-4 transition-colors hover:text-primary hover:underline"
                          title={`View ${r.symbol} details`}
                        >
                          {r.symbol}
                        </Link>
                        {!r.quoted && (
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
                      {showPrice(r)}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <span
                        className={cn(
                          "tnum inline-flex items-center justify-end gap-0.5 font-semibold",
                          up ? "text-emerald-600" : "text-rose-600"
                        )}
                      >
                        {up ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
                        {Math.abs(r.changePct).toFixed(2)}%
                      </span>
                      {/* Absolute session move ($) beneath the % — both requested */}
                      <span className={cn("tnum block text-[0.62rem]", up ? "text-emerald-600/70" : "text-rose-600/70")}>
                        {r.quoted ? fmtAbs(r.changeAbs, r.price) : "—"}
                      </span>
                    </td>
                    {showHigh && (
                    <td className="tnum hidden py-2.5 px-3 text-right text-muted-foreground lg:table-cell">
                      {r.dayHigh ? (r.coinId ? fmtPrice(r.dayHigh) : formatMarketPrice(r.dayHigh, r.currency)) : "—"}
                    </td>
                    )}
                    {showLow && (
                    <td className="tnum hidden py-2.5 px-3 text-right text-muted-foreground lg:table-cell">
                      {r.dayLow ? (r.coinId ? fmtPrice(r.dayLow) : formatMarketPrice(r.dayLow, r.currency)) : "—"}
                    </td>
                    )}
                    {showVolume && (
                    <td className="tnum hidden py-2.5 px-3 text-right text-muted-foreground md:table-cell">
                      {fmtVolume(r.volume)}
                    </td>
                    )}
                    {showCap && (
                    <td className="tnum hidden py-2.5 px-3 text-right text-muted-foreground xl:table-cell">
                      {fmtCap(r.marketCap, r.currency)}
                    </td>
                    )}
                    {showChain && (
                      <td className="max-w-[10rem] py-2.5 pl-3 text-right text-xs text-muted-foreground">
                        {r.blockchain || ""}
                      </td>
                    )}
                    {allowBuy && (
                      <td className="py-2.5 pl-3 text-right">
                        <Button size="sm" variant="outline" className="h-8 px-2.5" onClick={() => openBuy(r)}>
                          <ShoppingCart className="size-3.5 sm:mr-1.5" />
                          <span className="hidden sm:inline">Buy</span>
                        </Button>
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {isCryptoTab && rows.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 px-1 pt-3">
          <p className="text-xs text-muted-foreground">
            Showing {cryptoPageSafe * CRYPTO_PAGE_SIZE + 1}–
            {Math.min(rows.length, (cryptoPageSafe + 1) * CRYPTO_PAGE_SIZE)} of {rows.length}
            {` · ${cryptoCoveragePhrase(rows.length)}`}
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={cryptoPageSafe <= 0}
              onClick={() => setCryptoPage((p) => Math.max(0, p - 1))}
            >
              Previous
            </Button>
            <span className="text-xs text-muted-foreground">
              {cryptoPageSafe + 1} / {cryptoPageCount}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={cryptoPageSafe >= cryptoPageCount - 1}
              onClick={() => setCryptoPage((p) => Math.min(cryptoPageCount - 1, p + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      <BuyDialog
        open={buyOpen}
        onOpenChange={setBuyOpen}
        target={buyTarget}
        onDone={() => {
          setBuyOpen(false);
          onBought?.();
        }}
      />

    </div>
  );
}
