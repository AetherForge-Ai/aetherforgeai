"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { formatMarketPrice } from "@/lib/market-intel";
import {
  CHANGE_NOT_STATED,
  PRICE_NOT_IN_RESPONSE,
  STOCK_BOARDS,
  type StockBoard,
} from "@/lib/stock-markets";
import type { PublicMarketIndex } from "@/lib/public-market-types";
import { BuyDialog, type BuyTarget } from "@/components/dashboard/BuyDialog";
import { cryptoCoveragePhrase, dexCoverageLine, dexTabLabel } from "@/lib/crypto-coverage";
import { DEX_EMPTY_NOTICE } from "@/lib/crypto-dex";
import { explorerDetailHref, marketsTabHref, type MarketsTab } from "@/lib/market-detail-routes";
import type { PublicPriceRow } from "@/lib/public-market-types";
import { paperAddSignupHref } from "@/lib/paper-add-link";
import { useCryptoMarkets } from "@/hooks/useCryptoMarkets";
import { useDexMarkets } from "@/hooks/useDexMarkets";
import { useFxRates } from "@/hooks/useFxRates";
import {
  coinHasLivePrice,
  fmtPrice,
  formatAbsoluteChange,
  formatMarketChangePercent,
  resolvableCoinId,
} from "@/lib/crypto-market";
import { coinDisplayName } from "@/lib/crypto-names";
import { formatDisplayClock, formatFxInput, formatUnitPrice, usdToNzd } from "@/lib/currency";
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
  exchange: StockBoard;
  currency: "NZD" | "AUD" | "USD";
  price: number | null;
  changePct: number | null;
  changeAbs: number | null;
  priceLabel?: string;
  changeLabel?: string;
  source?: string | null;
  asOf?: string;
  dayHigh: number | null;
  dayLow: number | null;
  volume: number | null;
  marketCap: number | null;
  live: boolean;
  quoted?: boolean;
  freshness?: string;
}

export interface MarketPayload {
  exchange: StockBoard;
  label: string;
  sub: string;
  currency: "NZD" | "AUD" | "USD";
  live: boolean;
  liveCount: number;
  total: number;
  matchTotal?: number;
  page?: number;
  pageCount?: number;
  coverage?: string;
  note?: string;
  unpricedCount?: number;
  footnote?: string | null;
  asOf: string | null;
  freshness?: string;
  rows: MarketRow[];
}

type SortKey = "symbol" | "price" | "changePct" | "volume" | "marketCap";

/** A tab is either a stock exchange or the live crypto universe. */
type Tab = MarketsTab;

/**
 * Normalized row rendered by the table — stock rows (from /api/all-markets) and
 * crypto rows (from the CoinGecko-first list) are both mapped into this shape
 * so a single table, sort and search cover every asset class.
 */
interface DisplayRow {
  key: string;
  ticker: string; // internal ticker used for a Buy (e.g. BHP.AX or BTC)
  symbol: string; // display symbol
  name: string;
  currency: "NZD" | "AUD" | "USD";
  price: number | null;
  changePct: number | null;
  changeAbs: number | null;
  priceLabel?: string;
  changeLabel?: string;
  source?: string | null;
  rowAsOf?: string;
  dayHigh: number | null;
  dayLow: number | null;
  volume: number | null;
  marketCap: number | null;
  live: boolean;
  quoted: boolean;
  exchange?: StockBoard; // stock rows only — needed to open the stock detail view
  coinId?: string; // crypto rows only — CoinGecko id for /markets/crypto/[id]
  blockchain?: string;
  dex?: string;
  paperMarket?: "Crypto" | "DEX";
  priceUnavailable?: boolean;
}

function seedDisplayRows(rows: PublicPriceRow[], market: "Crypto" | "DEX"): DisplayRow[] {
  return rows
    .filter((row) => typeof row.usd === "number" && row.usd > 0)
    .map((row) => ({
      key: row.href || row.symbol,
      ticker: row.symbol.toUpperCase(),
      symbol: row.symbol.toUpperCase(),
      name: row.name,
      currency: "USD" as const,
      price: row.usd as number,
      changePct: row.changePct ?? 0,
      changeAbs: row.usd && row.changePct ? (row.usd * row.changePct) / 100 : 0,
      dayHigh: null,
      dayLow: null,
      volume: null,
      marketCap: null,
      live: true,
      quoted: true,
      coinId: row.quoteId,
      paperMarket: market,
      priceUnavailable: false,
    }));
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

/** A signed price move. Sub-cent coins keep significant digits (never +0.0000). */
function fmtAbs(v: number, price: number): string {
  return formatAbsoluteChange(v, price);
}

function fmtTime(iso: string): string {
  const clock = formatDisplayClock(iso);
  return clock === "—" ? "" : clock;
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
  signedIn = true,
  initialTab = null,
  syncTab = false,
  onTabChange,
  index = null,
  dexCredit = "Powered by GeckoTerminal",
}: {
  onBought?: () => void;
  /** When false the component skips fetching (e.g. modal is closed). */
  active?: boolean;
  className?: string;
  /** Public /markets hides the share Buy column. Crypto and DEX rows always offer Add. */
  allowBuy?: boolean;
  /** Guests get a sign-up link. Members open the paper-book panel. Dashboard defaults to signed in. */
  signedIn?: boolean;
  /** From /markets?tab= so a detail page can return to the same board. */
  initialTab?: Tab | null;
  /** Write the selected tab into the /markets query. Off inside the dashboard modal. */
  syncTab?: boolean;
  onTabChange?: (tab: Tab) => void;
  /** Server-rendered boards. Crypto and DEX rows from this index show until the client list arrives. */
  index?: PublicMarketIndex | null;
  /** Server-built credit. Defaults to GeckoTerminal. The second name is passed only when its display flag is on. */
  dexCredit?: string;
}) {
  const seedCrypto = index?.tabs.find((row) => row.id === "CRYPTO")?.rows ?? [];
  const seedDex = index?.tabs.find((row) => row.id === "DEX")?.rows ?? [];
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(initialTab ?? "NZX");
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
  const [stockPage, setStockPage] = useState(1);
  const [includeDerivatives, setIncludeDerivatives] = useState(false);
  const [cryptoInNzd, setCryptoInNzd] = useState(false);
  const fx = useFxRates();
  const fxReady = fx.ready && !!fx.asOf;
  const loadGen = useRef(0);

  const isCoinTab = tab === "CRYPTO";
  const isDexTab = tab === "DEX";
  /** Coin list or DEX list — neither is a share exchange. */
  const isCryptoTab = isCoinTab || isDexTab;

  useEffect(() => {
    if (initialTab) setTab(initialTab);
  }, [initialTab]);

  function selectTab(next: Tab) {
    if (next !== tab) {
      // Invalidate an in-flight quote before the next load() starts, so the
      // previous exchange cannot paint under the new tab.
      loadGen.current += 1;
      setLoadError(null);
      setRemoteHits([]);
      if (next !== "CRYPTO" && next !== "DEX") {
        const seeded = seedFor(next);
        setData(seeded);
        setLoading(!seeded);
      }
    }
    setTab(next);
    onTabChange?.(next);
    if (!syncTab) return;
    router.replace(marketsTabHref(next), { scroll: false });
  }

  // CoinGecko top 400. A missing print stays unavailable. Shares the cached store.
  const crypto = useCryptoMarkets(active && isCoinTab);
  const dex = useDexMarkets(active && isDexTab);

  const seedFor = useCallback((ex: StockBoard): MarketPayload | null => {
    const tab = index?.tabs.find((row) => row.id === ex);
    if (!tab?.rows.length) return null;
    return {
      exchange: ex,
      label: tab.title,
      sub: "",
      currency: ex === "NZX" ? "NZD" : ex === "ASX" ? "AUD" : "USD",
      live: false,
      liveCount: tab.rows.filter((row) => row.price && row.price !== PRICE_NOT_IN_RESPONSE).length,
      total: tab.rows.length,
      page: 1,
      pageCount: 1,
      coverage: tab.coverage,
      note: tab.note,
      footnote: tab.footnote,
      asOf: null,
      freshness: tab.asOf,
      rows: tab.rows.map((row) => {
        const quoted = !!row.price && row.price !== PRICE_NOT_IN_RESPONSE;
        const part = row.href.split("/").pop() || row.symbol;
        let ticker = row.symbol;
        try {
          ticker = decodeURIComponent(part);
        } catch {
          ticker = row.symbol;
        }
        return {
          ticker,
          symbol: row.symbol,
          name: row.name,
          sector: "Not stated",
          exchange: ex,
          currency: ex === "NZX" ? "NZD" : ex === "ASX" ? "AUD" : "USD",
          price: null,
          changePct: null,
          changeAbs: null,
          priceLabel: row.price || PRICE_NOT_IN_RESPONSE,
          changeLabel: row.change || CHANGE_NOT_STATED,
          source: row.source || null,
          asOf: row.asOf,
          dayHigh: null,
          dayLow: null,
          volume: null,
          marketCap: null,
          live: false,
          quoted,
          freshness: row.asOf,
        };
      }),
    };
  }, [index]);

  // `silent` refresh keeps the current rows on screen (no skeleton flash).
  const load = useCallback(async (ex: StockBoard, silent = false, page = 1, q = "", derivatives = false) => {
    const gen = ++loadGen.current;
    if (!silent) {
      setLoadError(null);
      setData((current) => {
        if (current?.exchange === ex && current.rows.length) return current;
        return seedFor(ex);
      });
      setLoading(true);
    }
    console.log(`[markets-explorer] Loading prices for ${ex}…${silent ? " (auto)" : ""}`);
    const params = new URLSearchParams({ exchange: ex, page: String(page) });
    if (q.trim()) params.set("q", q.trim());
    if ((ex === "NASDAQ" || ex === "NYSE") && derivatives) params.set("derivatives", "1");
    try {
      const res = await api.get<MarketPayload>(`/api/all-markets?${params.toString()}`, {
        signal: AbortSignal.timeout(8_000),
      });
      if (gen !== loadGen.current) return;
      if (res.data?.exchange && res.data.exchange !== ex) return;
      if (res.ok && res.data?.rows?.length) {
        setData(res.data);
        setLoadError(null);
        console.log(`[markets-explorer] ${ex}: ${res.data.liveCount}/${res.data.total} quoted`);
      } else {
        console.error("[markets-explorer] Load failed:", res.error);
        if (!silent) setLoadError("The latest prices are not in this response. The saved page stays on screen.");
      }
    } catch (err) {
      if (gen !== loadGen.current) return;
      console.error("[markets-explorer] Load failed:", err);
      if (!silent) setLoadError("The latest prices are not in this response. The saved page stays on screen.");
    }
    if (gen === loadGen.current) setLoading(false);
  }, [seedFor]);

  // Load stock exchange data whenever active + a stock tab is selected. (Crypto
  // is handled by the useCryptoMarkets hook above.)
  const [debouncedQuery, setDebouncedQuery] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);
  useEffect(() => {
    setStockPage(1);
  }, [debouncedQuery, tab]);

  useEffect(() => {
    if (active && !isCryptoTab) load(tab as StockBoard, false, stockPage, debouncedQuery, includeDerivatives);
  }, [active, tab, isCryptoTab, load, stockPage, debouncedQuery, includeDerivatives]);

  // Auto-refresh live stock prices every 45s while the browser is open — no
  // skeleton flash, just fresh numbers. Paused when inactive or on the crypto tab.
  useEffect(() => {
    if (!active || isCryptoTab) return;
    const id = setInterval(() => load(tab as StockBoard, true, stockPage, debouncedQuery, includeDerivatives), 45_000);
    return () => clearInterval(id);
  }, [active, tab, isCryptoTab, load, stockPage, debouncedQuery, includeDerivatives]);

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
        tab === "ASX" ? "ASX" : tab === "NZX" ? "NZX" : tab === "NASDAQ" ? "NASDAQ" : tab === "NYSE" ? "NYSE" : tab === "DOW" ? "NYSE" : "";
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
          label === "ASX" ? "ASX" : label === "NZX" ? "NZX" : label === "NASDAQ" ? "NASDAQ" : label === "NYSE" ? "NYSE" : "DOW"
        ) as StockBoard;
        mapped.push({
          key: `remote:${sym}`,
          ticker: sym,
          symbol: bare,
          name: m.name || sym,
          currency,
          price: null,
          changePct: null,
          changeAbs: null,
          priceLabel: PRICE_NOT_IN_RESPONSE,
          changeLabel: CHANGE_NOT_STATED,
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
              r.ticker === row.ticker && qr.data!.price! > 0
                ? {
                    ...r,
                    price: qr.data!.price!,
                    changePct: qr.data!.changePct ?? 0,
                    priceLabel: undefined,
                    changeLabel: undefined,
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
    if (isDexTab) dex.refresh();
    else if (isCoinTab) crypto.refresh();
    else void load(tab as StockBoard, false, stockPage, debouncedQuery, includeDerivatives);
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
    if (isDexTab) {
      if (!dex.rows.length && seedDex.length) {
        all = seedDisplayRows(seedDex, "DEX");
      } else
      all = dex.rows.slice(0, CRYPTO_TOP_N).map((row) => ({
        key: `${row.symbol}:${row.id}:${row.network}`,
        ticker: row.symbol.toUpperCase(),
        symbol: row.symbol.toUpperCase(),
        name: coinDisplayName(row.symbol, row.name),
        currency: "USD" as const,
        price: row.price || 0,
        changePct: 0,
        changeAbs: 0,
        dayHigh: null,
        dayLow: null,
        volume: row.volume24h,
        marketCap: null,
        live: !row.priceUnavailable && (row.price || 0) > 0,
        quoted: !row.priceUnavailable && (row.price || 0) > 0,
        coinId: resolvableCoinId(row.detailId) || undefined,
        blockchain: row.network && row.network !== "Unavailable" ? row.network : "",
        dex: row.dex || "",
        paperMarket: "DEX" as const,
        priceUnavailable: row.priceUnavailable || !(row.price != null && row.price > 0),
      }));
    } else if (isCoinTab) {
      if (!crypto.coins.length && seedCrypto.length) {
        all = seedDisplayRows(seedCrypto, "Crypto");
      } else {
      const top = [...crypto.coins]
        .filter((c) => coinHasLivePrice(c))
        .sort((a, b) => (a.rank ?? 999999) - (b.rank ?? 999999))
        .slice(0, CRYPTO_TOP_N);
      all = top.map((c) => ({
        key: c.id,
        ticker: c.symbol.toUpperCase(),
        symbol: c.symbol.toUpperCase(),
        name: coinDisplayName(c.symbol, c.name),
        currency: "USD" as const,
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
        paperMarket: "Crypto" as const,
        priceUnavailable: !!c.priceUnavailable || !(c.price > 0),
      }));
      }
    } else {
      all = (data?.rows ?? [])
        .filter((r) => r.quoted && r.priceLabel !== PRICE_NOT_IN_RESPONSE)
        .map((r) => ({
        key: r.ticker,
        ticker: r.ticker,
        symbol: r.symbol,
        name: r.name,
        currency: r.currency,
        price: r.quoted && r.price != null && r.price > 0 ? r.price : null,
        changePct: r.quoted ? r.changePct : null,
        changeAbs: r.quoted ? r.changeAbs : null,
        priceLabel: r.priceLabel,
        changeLabel: r.changeLabel,
        source: r.source,
        rowAsOf: r.asOf,
        dayHigh: r.dayHigh,
        dayLow: r.dayLow,
        volume: r.volume,
        marketCap: r.marketCap,
        live: false,
        quoted: !!r.quoted && r.price != null && r.price > 0,
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
    const num = (value: number | null | undefined) => (value == null || !Number.isFinite(value) ? null : value);
    return [...merged].sort((a, b) => {
      if (sortKey === "symbol") return a.symbol.localeCompare(b.symbol) * dir;
      const av = sortKey === "volume" ? num(a.volume) : sortKey === "marketCap" ? num(a.marketCap) : num(a[sortKey]);
      const bv = sortKey === "volume" ? num(b.volume) : sortKey === "marketCap" ? num(b.marketCap) : num(b[sortKey]);
      if (av == null && bv == null) return a.symbol.localeCompare(b.symbol);
      if (av == null) return 1;
      if (bv == null) return -1;
      return (av - bv) * dir;
    });
  }, [isCoinTab, isDexTab, crypto.coins, dex.rows, seedCrypto, seedDex, data, query, sortKey, sortDir, remoteHits]);

  // Live-price formatter — crypto needs micro-price precision, stocks are currency-aware.
  const showNzd = isCryptoTab && cryptoInNzd && fxReady;
  const showPrice = (r: DisplayRow) => {
    if (r.coinId) {
      if (r.priceUnavailable || !(r.price != null && r.price > 0)) return "—";
      if (showNzd) return formatUnitPrice(usdToNzd(r.price, fx.rates.USD), "NZD");
      return fmtPrice(r.price);
    }
    if (r.priceLabel && (!r.quoted || r.priceLabel === PRICE_NOT_IN_RESPONSE)) return r.priceLabel;
    if (!(r.price != null && r.price > 0)) return PRICE_NOT_IN_RESPONSE;
    return formatMarketPrice(r.price, r.currency);
  };
  const showUnit = (value: number | null, r: DisplayRow) => {
    if (!value || !(value > 0)) return "—";
    if (r.coinId && showNzd) return formatUnitPrice(usdToNzd(value, fx.rates.USD), "NZD");
    return r.coinId ? fmtPrice(value) : formatMarketPrice(value, r.currency);
  };

  // Unified loading + status across both data sources.
  const seededCrypto = isCoinTab && crypto.coins.length === 0 && seedCrypto.some((row) => (row.usd ?? 0) > 0);
  const seededDex = isDexTab && dex.rows.length === 0 && seedDex.some((row) => (row.usd ?? 0) > 0);
  const loadingRows = isDexTab ? dex.loading && !seededDex : isCoinTab ? crypto.loading && !seededCrypto : loading;
  const stockLoading = !isCryptoTab && loading && !(data?.rows.length);
  const cryptoListed = isDexTab
    ? Math.min(CRYPTO_TOP_N, dex.rows.length || seedDex.length)
    : Math.min(CRYPTO_TOP_N, crypto.coins.length || seedCrypto.length);
  const total = isCryptoTab ? cryptoListed : data?.total ?? 0;
  const liveCount = isCryptoTab ? cryptoListed : data?.liveCount ?? 0;
  const asOf = isCryptoTab ? "" : data?.asOf ?? "";
  const hasData = isDexTab ? dex.rows.length > 0 || seededDex : isCoinTab ? crypto.coins.length > 0 || seededCrypto : !!data;
  const cryptoPageCount = Math.max(1, Math.ceil(rows.length / CRYPTO_PAGE_SIZE));
  const cryptoPageSafe = Math.min(cryptoPage, cryptoPageCount - 1);
  const visibleRows = isCryptoTab
    ? rows.slice(cryptoPageSafe * CRYPTO_PAGE_SIZE, cryptoPageSafe * CRYPTO_PAGE_SIZE + CRYPTO_PAGE_SIZE)
    : rows;
  const showHigh = !isCryptoTab;
  const showLow = !isCryptoTab;
  const cappedRows = rows.filter((r) => (r.marketCap ?? 0) > 0).length;
  const showVolume = isCoinTab || (!isDexTab && rows.some((r) => (r.volume ?? 0) > 0));
  const showCap = isCoinTab || (!isCryptoTab && rows.length > 0 && cappedRows * 2 > rows.length);
  const showChange = !isDexTab;
  const showChain = isCryptoTab;
  const showDex = isDexTab;
  const showAdd = isCryptoTab;
  const colSpan =
    2 +
    Number(showChange) +
    1 +
    Number(showHigh) +
    Number(showLow) +
    Number(showVolume) +
    Number(showCap) +
    Number(showChain) +
    Number(showDex) +
    Number(showAdd) +
    Number(allowBuy && !isCryptoTab);

  function openBuy(r: DisplayRow) {
    setBuyTarget({ ticker: r.ticker, name: r.name, assetType: r.coinId ? "crypto" : "stock", price: r.price });
    setBuyOpen(true);
  }

  function paperMarketOf(r: DisplayRow): "Crypto" | "DEX" {
    return r.paperMarket || (isDexTab ? "DEX" : "Crypto");
  }

  function openPaperAdd(r: DisplayRow) {
    if (!signedIn) return;
    setBuyTarget({
      ticker: r.ticker,
      name: r.name,
      assetType: "crypto",
      price: r.price > 0 ? r.price : undefined,
      coinId: r.coinId,
      market: paperMarketOf(r),
      chain: r.blockchain && r.blockchain !== "—" ? r.blockchain : undefined,
    });
    setBuyOpen(true);
  }

  function paperSignupHref(r: DisplayRow): string {
    return paperAddSignupHref({
      coinId: r.coinId,
      symbol: r.symbol,
      name: r.name,
      market: paperMarketOf(r),
    });
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
        fallbackExchange: !r.coinId && !isCryptoTab ? (tab as StockBoard) : null,
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
        {STOCK_BOARDS.map((ex) => {
          const activeEx = ex === tab;
          const label = ex === "DOW" ? "Dow Jones" : ex;
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
              {label}
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
        <button
          onClick={() => selectTab("DEX")}
          className={cn(
            "rounded-xl border px-3.5 py-2 text-sm font-semibold transition-colors",
            isDexTab
              ? "border-primary bg-primary text-primary-foreground shadow-glow"
              : "border-border/60 bg-background/40 text-muted-foreground hover:text-foreground"
          )}
        >
          {dexTabLabel(dex.rows.length)}
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
            placeholder={isCryptoTab ? "Search ticker or name…" : "Search ticker or company…"}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex flex-col items-end gap-0.5">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Radio className={cn("size-3.5", liveCount > 0 ? "text-emerald-600" : "text-muted-foreground")} />
            {(isDexTab ? dex.error : isCoinTab ? crypto.error : loadError)
              ? (isDexTab ? dex.error : isCoinTab ? crypto.error : loadError)
              : hasData || remoteHits.length
              ? `${data?.coverage || `${total} names in the ${isCryptoTab ? "crypto" : tab} list`}${liveCount > 0 && liveCount !== total ? ` · ${liveCount} quoted on this page` : ""}${remoteLoading ? " · searching…" : ""}${remoteHits.length && query.trim() ? ` · +${remoteHits.length} market match${remoteHits.length === 1 ? "" : "es"}` : ""}`
              : stockLoading
              ? "Loading the list…"
              : loadingRows
                ? "A price shows here after the feed returns a figure."
                : PRICE_NOT_IN_RESPONSE}
          </p>
          {!isCryptoTab && !stockLoading && data && (
            <p className="flex items-center gap-1 text-[0.62rem] text-muted-foreground/80">
              <Clock className="size-3" /> {data.freshness || "Latest available price"}
            </p>
          )}
          {isCoinTab && (
            <p className="flex items-center gap-1 text-[0.62rem] text-muted-foreground/80">
              <Bitcoin className="size-3" /> {cryptoCoveragePhrase(cryptoListed)} · {showNzd ? "NZ$" : "USD"}
              {fxReady ? ` · 1 USD = NZ$${formatFxInput(fx.rates.USD)}` : " · NZ$ prices appear when today's exchange rate loads."}
              {crypto.notice ? ` · ${crypto.notice}` : ""}
            </p>
          )}
          {isCoinTab && <p className="text-sm text-muted-foreground">Powered by CoinGecko</p>}
          {isCryptoTab && (
            <button
              type="button"
              className="rounded-lg border border-border/70 px-2.5 py-1 text-xs font-semibold disabled:opacity-50"
              disabled={!fxReady}
              aria-pressed={showNzd}
              onClick={() => setCryptoInNzd((on) => !on)}
            >
              {showNzd ? "Showing NZ$" : "Show NZ$"}
            </button>
          )}
          {isDexTab && (
            <p className="flex items-center gap-1 text-[0.62rem] text-muted-foreground/80">
              <Bitcoin className="size-3" /> {dexCoverageLine(cryptoListed)}
              {dex.notice ? ` · ${dex.notice}` : ""}
            </p>
          )}
          {isDexTab && <p className="text-sm text-muted-foreground">{dexCredit}</p>}
          {(tab === "NASDAQ" || tab === "NYSE") && (
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={includeDerivatives}
                onChange={(event) => {
                  setIncludeDerivatives(event.target.checked);
                  setStockPage(1);
                }}
              />
              Include warrants, units and rights
            </label>
          )}
          {!isCryptoTab && data?.footnote ? (
            <p className="text-xs text-muted-foreground">{data.footnote}</p>
          ) : null}
        </div>
      </div>

      {/* Table — scrolls on BOTH axes so wide rows never push the page sideways on mobile */}
      <div className="min-h-0 flex-1 overflow-auto px-1 pb-2">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-card">
            <tr className="border-b border-border/60">
              <th className="py-2.5 pr-3 text-left"><SortHead label="Ticker" k="symbol" align="left" /></th>
              <th className="hidden py-2.5 pr-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground sm:table-cell">
                {isCryptoTab ? "Name" : "Company"}
              </th>
              <th className="py-2.5 px-3"><SortHead label="Price" k="price" /></th>
              {showChange && <th className="py-2.5 px-3"><SortHead label="Change" k="changePct" /></th>}
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
                  {isDexTab ? "Chain" : "Blockchain"}
                </th>
              )}
              {showDex && (
                <th className="py-2.5 pl-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  DEX
                </th>
              )}
              {showAdd && (
                <th className="py-2.5 pl-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Paper book
                </th>
              )}
              {allowBuy && !isCryptoTab && (
                <th className="py-2.5 pl-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Buy
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {stockLoading || ((isCoinTab ? crypto.loading && !seededCrypto : isDexTab ? dex.loading && !seededDex : false) && rows.length === 0) ? (
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
                    : isDexTab
                      ? dex.notice || dex.error || DEX_EMPTY_NOTICE
                      : isCoinTab
                      ? "No earlier price is stored."
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
                          aria-label={`${r.symbol}, ${r.name}`}
                        >
                          {r.symbol}
                        </Link>
                        {!r.quoted && !r.coinId && (
                          <span className="rounded bg-muted/60 px-1 py-0.5 text-[0.55rem] font-semibold uppercase text-muted-foreground">
                            no print
                          </span>
                        )}
                      </div>
                      <span className="text-[0.66rem] text-muted-foreground sm:hidden" aria-hidden="true">{r.name}</span>
                      {!r.coinId && (
                        <span className="block text-[0.62rem] text-muted-foreground">
                          {r.quoted ? `${r.source || "Last good"} · ${r.rowAsOf || ""}` : PRICE_NOT_IN_RESPONSE}
                        </span>
                      )}
                    </td>
                    <td className="hidden max-w-[16rem] truncate py-2.5 pr-3 text-muted-foreground sm:table-cell" aria-hidden="true">
                      {r.name}
                      {!r.coinId && (
                        <span className="block text-[0.62rem]">
                          {r.quoted ? `${r.source || "Last good"} · ${r.rowAsOf || ""}` : PRICE_NOT_IN_RESPONSE}
                        </span>
                      )}
                    </td>
                    <td className="tnum py-2.5 px-3 text-right font-medium">
                      {showPrice(r)}
                    </td>
                    {showChange && (
                    <td className="py-2.5 px-3 text-right">
                      {r.quoted && r.changePct != null && r.price != null ? (
                        <>
                          <span
                            className={cn(
                              "tnum inline-flex items-center justify-end gap-0.5 font-semibold",
                              up ? "text-emerald-600" : "text-rose-600"
                            )}
                          >
                            {up ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
                            {r.changePct > 0 ? "+" : r.changePct < 0 ? "−" : ""}
                            {formatMarketChangePercent(r.changePct)}%
                          </span>
                          <span className={cn("tnum block text-[0.62rem]", up ? "text-emerald-600/70" : "text-rose-600/70")}>
                            {fmtAbs(r.changeAbs ?? 0, r.price)}
                          </span>
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground">{r.changeLabel || CHANGE_NOT_STATED}</span>
                      )}
                    </td>
                    )}
                    {showHigh && (
                    <td className="tnum hidden py-2.5 px-3 text-right text-muted-foreground lg:table-cell">
                      {showUnit(r.dayHigh, r)}
                    </td>
                    )}
                    {showLow && (
                    <td className="tnum hidden py-2.5 px-3 text-right text-muted-foreground lg:table-cell">
                      {showUnit(r.dayLow, r)}
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
                        {r.blockchain || "—"}
                      </td>
                    )}
                    {showDex && (
                      <td className="max-w-[10rem] py-2.5 pl-3 text-right text-xs text-muted-foreground">
                        {r.dex || "—"}
                      </td>
                    )}
                    {showAdd && (
                      <td className="py-2.5 pl-3 text-right">
                        {signedIn ? (
                          <Button size="sm" variant="outline" className="h-8 px-2.5" onClick={() => openPaperAdd(r)}>
                            Add to paper book
                          </Button>
                        ) : (
                          <Button asChild size="sm" variant="outline" className="h-8 px-2.5">
                            <Link href={paperSignupHref(r)}>Add to paper book</Link>
                          </Button>
                        )}
                      </td>
                    )}
                    {allowBuy && !isCryptoTab && (
                      <td className="py-2.5 pl-3 text-right">
                        <Button size="sm" variant="outline" className="h-8 px-2.5" disabled={!r.quoted || !(r.price != null && r.price > 0)} onClick={() => openBuy(r)}>
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

      {!isCryptoTab && (data?.pageCount || 1) > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 px-1 pt-3">
          <p className="text-xs text-muted-foreground">
            Page {data?.page || stockPage} of {data?.pageCount || 1}
            {data?.coverage ? ` · ${data.coverage}` : ""}
            {` · ${rows.length} names on this page`}
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={stockPage <= 1 || stockLoading}
              onClick={() => setStockPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={stockPage >= (data?.pageCount || 1) || stockLoading}
              onClick={() => setStockPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {isCryptoTab && rows.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 px-1 pt-3">
          <p className="text-xs text-muted-foreground">
            Showing {cryptoPageSafe * CRYPTO_PAGE_SIZE + 1}–
            {Math.min(rows.length, (cryptoPageSafe + 1) * CRYPTO_PAGE_SIZE)} of {rows.length}
            {isDexTab
              ? ` · ${dexCoverageLine(rows.length)}`
              : ` · ${cryptoCoveragePhrase(rows.length)}`}
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

      {signedIn ? (
        <BuyDialog
          open={buyOpen}
          onOpenChange={setBuyOpen}
          target={buyTarget}
          onDone={() => {
            setBuyOpen(false);
            onBought?.();
          }}
        />
      ) : null}

    </div>
  );
}
