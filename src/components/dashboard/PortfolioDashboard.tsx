"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import {
  computeSummary,
  formatPercent,
  formatNumber,
  type Stock,
} from "@/lib/portfolio";
import {
  formatMoney,
  baseCurrencyForBot,
  BASELINE_FX_TO_NZD,
  CURRENCY_META,
  type FxRatesToNZD,
} from "@/lib/currency";
import { StockDialog } from "@/components/dashboard/StockDialog";
import {
  HoldingChartDialog,
  type HoldingChartTarget,
} from "@/components/dashboard/HoldingChartDialog";
import { TransactionCenter } from "@/components/dashboard/TransactionCenter";
import { AnalysisPanel } from "@/components/dashboard/AnalysisPanel";
import { ReportCenter } from "@/components/dashboard/ReportCenter";
import { PriceAlerts } from "@/components/dashboard/PriceAlerts";
import { PreciousMetals } from "@/components/dashboard/PreciousMetals";
import { planLabel } from "@/lib/plans";
import { checkTickerQuota, limitScope, resolveTickerLimit } from "@/lib/entitlements";
import { computePortfolioMetrics } from "@/lib/analytics";
import { AllMarkets } from "@/components/dashboard/AllMarkets";
import { OpenMarketSnapshot } from "@/components/dashboard/OpenMarketSnapshot";
import { AnimatedMoney } from "@/components/dashboard/AnimatedMoney";
import { TopMovers } from "@/components/dashboard/TopMovers";
import { MarketWidePerformers } from "@/components/dashboard/MarketWidePerformers";
import { CryptoMarketSection } from "@/components/dashboard/crypto/CryptoMarketSection";
import { ActionableIntelligence } from "@/components/dashboard/ActionableIntelligence";
import { NewsFeed } from "@/components/dashboard/NewsFeed";
import { MarketIntelProvider } from "@/components/dashboard/MarketIntelContext";
import { WatchlistPanel } from "@/components/dashboard/WatchlistPanel";
import { GlobalSearch } from "@/components/dashboard/GlobalSearch";
import { LockedSection } from "@/components/dashboard/LockedSection";
import { CollapsibleSection } from "@/components/dashboard/CollapsibleSection";
import type { AssetClass, UniverseEntry } from "@/lib/market-intel";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Plus,
  RefreshCw,
  Loader2,
  TrendingUp,
  TrendingDown,
  Wallet,
  Trophy,
  Layers,
  Pencil,
  Trash2,
  PieChart,
  CalendarClock,
  BadgeCheck,
  Zap,
  HeartPulse,
  Activity,
  Gauge,
  LineChart,
  Bitcoin,
  Lock,
  Sparkles,
  Coins,
  Landmark,
  Newspaper,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Compass,
  Radar,
} from "lucide-react";
import Link from "next/link";

export interface DashboardSubscription {
  status?: string | null;
  plan?: string | null;
  startedAt?: string | null;
  expiresAt?: string | null;
  tickerLimit?: number | null;
  botAccess: "stock" | "crypto" | "both" | "none";
}

function fmtDate(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" });
}

/** Derive the listing exchange for a holding from its ticker suffix. */
// Compact, readable purchase date (e.g. "15 Jul 2026"). Legacy rows without a
// stored date render an em-dash so the column never looks broken.
function formatHoldingDate(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-NZ", { day: "2-digit", month: "short", year: "numeric" });
}

function exchangeForTicker(ticker: string, assetType?: string | null): string {
  if ((assetType || "stock") === "crypto") return "Crypto";
  const t = (ticker || "").toUpperCase();
  if (t.endsWith(".NZ")) return "NZX";
  if (t.endsWith(".AX")) return "ASX";
  if (t.endsWith(".L")) return "LSE";
  return "NASDAQ";
}

function botAccessLabel(access: DashboardSubscription["botAccess"]): string {
  switch (access) {
    case "both":
      return "Stock + Crypto bots";
    case "stock":
      return "Stock bot";
    case "crypto":
      return "Crypto bot";
    default:
      return "No bot access";
  }
}

const SECTOR_COLORS = [
  "var(--primary)",
  "var(--gold)",
  "oklch(0.7 0.14 250)",
  "oklch(0.72 0.15 320)",
  "oklch(0.75 0.15 30)",
  "oklch(0.78 0.13 190)",
  "oklch(0.68 0.12 130)",
];

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  tone?: "neutral" | "up" | "down";
}) {
  return (
    <div className="rounded-2xl border border-border/70 bg-card/50 p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <span
          className={cn(
            "grid size-8 place-items-center rounded-lg",
            tone === "up" && "bg-emerald-500/15 text-emerald-400",
            tone === "down" && "bg-rose-500/15 text-rose-400",
            tone === "neutral" && "bg-primary/12 text-primary"
          )}
        >
          <Icon className="size-4" />
        </span>
      </div>
      <p
        className={cn(
          "tnum mt-3 font-display text-2xl font-bold",
          tone === "up" && "text-emerald-400",
          tone === "down" && "text-rose-400"
        )}
      >
        {value}
      </p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function MiniMetric({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="text-[0.68rem] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="tnum font-display text-lg font-bold leading-tight">{value}</p>
      </div>
    </div>
  );
}

// Representative demo portfolio shown to logged-out visitors so the gated
// sections render with believable, populated data behind the lock overlays
// (never empty). No network calls are made in preview mode.
const PREVIEW_STOCKS: Stock[] = [
  { _id: "demo-peb", ticker: "PEB.NZ", asset_type: "stock", company_name: "Pacific Edge", sector: "Healthcare", shares: 20000, purchase_price: 0.30, current_price: 0.37 },
  { _id: "demo-sto", ticker: "STO.AX", asset_type: "stock", company_name: "Santos", sector: "Energy", shares: 500, purchase_price: 7.2, current_price: 7.85 },
  { _id: "demo-cdw", ticker: "CDW", asset_type: "stock", company_name: "CDW Corporation", sector: "Technology", shares: 40, purchase_price: 210, current_price: 235 },
  { _id: "demo-sol", ticker: "SOL", asset_type: "crypto", company_name: "Solana", sector: "Layer 1", shares: 45, purchase_price: 175, current_price: 208 },
  { _id: "demo-ada", ticker: "ADA", asset_type: "crypto", company_name: "Cardano", sector: "Layer 1", shares: 8000, purchase_price: 0.55, current_price: 0.62 },
];
const PREVIEW_CASH_NZD = 12480.55;
const PREVIEW_METALS_NZD = 14808.0;

/** Sortable columns of the Current Holdings table. */
type HoldingSortKey =
  | "ticker"
  | "company"
  | "date"
  | "shares"
  | "purchase_price"
  | "current_price"
  | "marketValue"
  | "gain"
  | "weight";

export function PortfolioDashboard({
  userName,
  subscription,
  metalsEntitled,
  preview = false,
}: {
  userName: string;
  subscription: DashboardSubscription;
  /** Precious-metals bonus is unlocked for active paying members (or demo mode). */
  metalsEntitled: boolean;
  /** Guest preview — dashboard is visible but the member sections are locked. */
  preview?: boolean;
}) {
  // Active bot (Stock or Crypto). Defaults to the only bot the plan unlocks.
  const defaultBot: AssetClass = subscription.botAccess === "crypto" ? "crypto" : "stock";
  const [bot, setBot] = useState<AssetClass>(defaultBot);
  const [watchlistSignal, setWatchlistSignal] = useState(0);

  // Live FX rates (1 unit → NZD) so AUD (.AX) / USD holdings convert into the
  // Stox NZD "Total Worth". Falls back to the baseline table if the feed misses.
  const [fxToNZD, setFxToNZD] = useState<FxRatesToNZD>(BASELINE_FX_TO_NZD);
  // Base currency all totals are aggregated in: NZD for Stox, USD for Koins.
  const baseCurrency = useMemo(() => baseCurrencyForBot(bot), [bot]);

  useEffect(() => {
    let active = true;
    (async () => {
      const res = await api.get<{ ratesToNZD: FxRatesToNZD; live: boolean }>("/api/fx");
      if (active && res.ok && res.data?.ratesToNZD) {
        console.log("[dashboard] FX rates loaded:", res.data.live ? "live" : "baseline", res.data.ratesToNZD);
        setFxToNZD(res.data.ratesToNZD);
      } else if (!res.ok) {
        console.error("[dashboard] FX fetch failed, using baseline:", res.error);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // We load ALL holdings (both bots) so we can enforce the plan's ticker quota
  // correctly — the free tier counts stocks + crypto together. The active bot's
  // holdings are derived below.
  const [allStocks, setAllStocks] = useState<Stock[]>(preview ? PREVIEW_STOCKS : []);
  const [loading, setLoading] = useState(!preview);
  const [refreshing, setRefreshing] = useState(false);
  // Cash (NZD) + precious-metals value (NZD) power the "Totals owned" strip.
  const [cashBalance, setCashBalance] = useState(preview ? PREVIEW_CASH_NZD : 0);
  const [metalsValueNZD, setMetalsValueNZD] = useState(preview ? PREVIEW_METALS_NZD : 0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Stock | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Stock | null>(null);
  const [deleting, setDeleting] = useState(false);
  // Holding "last 7 days" chart popup — opened by clicking a ticker in the table.
  const [chartTarget, setChartTarget] = useState<HoldingChartTarget | null>(null);
  // Bumped whenever a metals buy/sell happens so the Transaction Center reloads
  // its ledger + cash cards in step with the top-level totals.
  const [ledgerSignal, setLedgerSignal] = useState(0);

  const stocks = useMemo(
    () => allStocks.filter((s) => (s.asset_type || "stock") === bot),
    [allStocks, bot]
  );

  const canUseBot = useCallback(
    (b: AssetClass) => subscription.botAccess === "both" || subscription.botAccess === b,
    [subscription.botAccess]
  );

  // Plan entitlements — how many tickers the member may monitor and how usage
  // is counted (free = across both bots; paid = per bot).
  const planUser = useMemo(
    () => ({ ticker_limit: subscription.tickerLimit, subscription_plan: subscription.plan }),
    [subscription.tickerLimit, subscription.plan]
  );
  const tickerLimit = useMemo(() => resolveTickerLimit(planUser), [planUser]);
  const scope = useMemo(() => limitScope(subscription.plan), [subscription.plan]);
  const quota = useMemo(
    () => checkTickerQuota(planUser, allStocks, bot),
    [planUser, allStocks, bot]
  );
  const atLimit = !quota.allowed;
  const holdingCounts = useMemo(
    () => ({
      stock: allStocks.filter((s) => (s.asset_type || "stock") === "stock").length,
      crypto: allStocks.filter((s) => s.asset_type === "crypto").length,
      total: allStocks.length,
    }),
    [allStocks]
  );
  // Tickers counted against the limit for the current bot/scope.
  const monitoredForLimit = scope === "total" ? holdingCounts.total : stocks.length;

  const loadStocks = useCallback(async () => {
    setLoading(true);
    const res = await api.get<Stock[]>(`/api/stocks`);
    if (res.ok && res.data) {
      setAllStocks(res.data);
    } else {
      console.error("[dashboard] Failed to load stocks:", res.error);
      toast.error("Could not load your portfolio.");
    }
    setLoading(false);
  }, []);

  // Cash balance (NZD) from the transaction ledger.
  const loadCash = useCallback(async () => {
    const res = await api.get<{ cashBalance: number }>("/api/transactions");
    if (res.ok && res.data) {
      setCashBalance(res.data.cashBalance ?? 0);
    } else {
      console.error("[dashboard] Failed to load cash balance:", res.error);
    }
  }, []);

  // Precious-metals total value (NZD) from live spot × ounces held.
  const loadMetals = useCallback(async () => {
    const res = await api.get<{
      metals: { metal: "gold" | "silver"; ounces: number }[];
      spot: { gold: { nzdPerOz: number }; silver: { nzdPerOz: number } };
    }>("/api/metals");
    if (res.ok && res.data?.spot) {
      const { metals, spot } = res.data;
      const total = (metals || []).reduce(
        (sum, m) => sum + m.ounces * (spot[m.metal]?.nzdPerOz ?? 0),
        0
      );
      setMetalsValueNZD(total);
    } else {
      // Not entitled / no metals — simply contributes 0 to the totals.
      setMetalsValueNZD(0);
    }
  }, []);

  useEffect(() => {
    if (preview) return; // guest preview uses seeded demo data — no network calls
    loadStocks();
    loadCash();
    loadMetals();
  }, [preview, loadStocks, loadCash, loadMetals]);

  // Live net-worth updates — silently re-price holdings every 60s so the totals
  // fluctuate with the market (AnimatedMoney tweens each change smoothly). No
  // toast, no spinner; skipped in guest preview and when nothing is held.
  useEffect(() => {
    if (preview) return;
    const id = setInterval(async () => {
      if (document.hidden) return; // don't poll a backgrounded tab
      const res = await api.post<Stock[]>("/api/stocks/refresh", {});
      if (res.ok && res.data) {
        setAllStocks(res.data);
        console.log("[dashboard] Live re-price tick applied");
      }
    }, 60_000);
    return () => clearInterval(id);
  }, [preview]);

  // Called whenever holdings or cash change (transactions, edits, deletes).
  const handleDataChanged = useCallback(() => {
    loadStocks();
    loadCash();
    loadMetals();
  }, [loadStocks, loadCash, loadMetals]);

  // Metals buy/sell also moves cash + writes the ledger — reload the top-level
  // totals AND signal the Transaction Center to refresh its ledger/cash cards.
  const handleMetalsChanged = useCallback(() => {
    handleDataChanged();
    setLedgerSignal((n) => n + 1);
  }, [handleDataChanged]);

  // Global-search pick: switch to the matching bot and track the symbol.
  async function handleSearchPick(assetClass: AssetClass, entry: UniverseEntry) {
    if (!canUseBot(assetClass)) {
      toast.error(`Your plan does not include the ${assetClass} bot. Upgrade to unlock it.`);
      return;
    }
    if (assetClass !== bot) setBot(assetClass);
    const res = await api.post("/api/watchlist", {
      ticker: entry.ticker,
      asset_type: assetClass,
      name: entry.name,
      market: entry.market,
    });
    if (res.ok) {
      toast.success(`${entry.ticker.replace(/\.(NZ|AX)$/, "")} added to your watchlist`);
      setWatchlistSignal((n) => n + 1);
    } else {
      console.error("[dashboard] Watchlist add failed:", res.error);
      toast.error("Could not add to watchlist.");
    }
  }

  const summary = useMemo(
    () => computeSummary(stocks, { baseCurrency, fxToNZD }),
    [stocks, baseCurrency, fxToNZD]
  );
  const metrics = useMemo(() => computePortfolioMetrics(stocks), [stocks]);

  // Sortable holdings table — default to largest positions (weight) first.
  const [holdingSort, setHoldingSort] = useState<{ key: HoldingSortKey; dir: "asc" | "desc" }>({
    key: "weight",
    dir: "desc",
  });
  const toggleHoldingSort = useCallback((key: HoldingSortKey) => {
    setHoldingSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "ticker" || key === "company" ? "asc" : "desc" }
    );
  }, []);
  const sortedHoldings = useMemo(() => {
    const { key, dir } = holdingSort;
    const mult = dir === "asc" ? 1 : -1;
    const val = (h: (typeof summary.holdings)[number]): number | string => {
      switch (key) {
        case "ticker":
          return h.ticker.toLowerCase();
        case "company":
          return (h.company_name || h.sector || "").toLowerCase();
        case "date":
          // Undated (legacy) rows sort to the bottom on desc / top on asc.
          return h.purchase_date ? new Date(h.purchase_date).getTime() : 0;
        case "shares":
          return h.shares;
        case "purchase_price":
          return h.purchase_price;
        case "current_price":
          return h.current_price;
        case "marketValue":
          return h.baseValue; // compare in a single base currency so it's apples-to-apples
        case "gain":
          return h.gainPct;
        case "weight":
          return h.weight;
      }
    };
    return [...summary.holdings].sort((a, b) => {
      const av = val(a);
      const bv = val(b);
      if (typeof av === "string" && typeof bv === "string") return av.localeCompare(bv) * mult;
      return ((av as number) - (bv as number)) * mult;
    });
  }, [summary.holdings, holdingSort]);

  // Sortable table header cell for the Current Holdings table.
  const HoldingHead = ({
    label,
    k,
    align = "right",
  }: {
    label: string;
    k: HoldingSortKey;
    align?: "left" | "right";
  }) => (
    <button
      onClick={() => toggleHoldingSort(k)}
      className={cn(
        "flex w-full items-center gap-1 font-medium uppercase tracking-wide transition-colors hover:text-foreground",
        holdingSort.key === k ? "text-foreground" : "text-muted-foreground",
        align === "right" ? "justify-end" : "justify-start"
      )}
    >
      {label}
      {holdingSort.key === k ? (
        holdingSort.dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />
      ) : (
        <ArrowUpDown className="size-3 opacity-40" />
      )}
    </button>
  );

  // Cross-bot totals, all expressed in NZD for the "Totals owned" strip.
  const stockHoldings = useMemo(
    () => allStocks.filter((s) => (s.asset_type || "stock") === "stock"),
    [allStocks]
  );
  const cryptoHoldings = useMemo(
    () => allStocks.filter((s) => s.asset_type === "crypto"),
    [allStocks]
  );
  const stockTotalNZD = useMemo(
    () => computeSummary(stockHoldings, { baseCurrency: "NZD", fxToNZD }).totalValue,
    [stockHoldings, fxToNZD]
  );
  const cryptoTotalNZD = useMemo(
    () => computeSummary(cryptoHoldings, { baseCurrency: "NZD", fxToNZD }).totalValue,
    [cryptoHoldings, fxToNZD]
  );
  // Live market value of everything held (excludes idle cash) + full net worth.
  const holdingsValueNZD = stockTotalNZD + cryptoTotalNZD + metalsValueNZD;
  const netWorthNZD = holdingsValueNZD + cashBalance;

  async function handleRefreshPrices() {
    setRefreshing(true);
    console.log("[dashboard] Refreshing market prices…");
    const res = await api.post<Stock[]>("/api/stocks/refresh", {});
    if (res.ok && res.data) {
      // The refresh endpoint returns all holdings; the active bot's are derived.
      setAllStocks(res.data);
      toast.success("Prices updated");
    } else {
      console.error("[dashboard] Refresh failed:", res.error);
      toast.error("Could not refresh prices.");
    }
    setRefreshing(false);
  }

  function openAdd() {
    // Gate on the plan's ticker quota before opening the add dialog.
    if (atLimit) {
      toast.error(quota.message);
      return;
    }
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(stock: Stock) {
    setEditing(stock);
    setDialogOpen(true);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    console.log("[dashboard] Deleting stock", deleteTarget._id);
    const res = await api.delete(`/api/stocks/${deleteTarget._id}`);
    setDeleting(false);
    if (res.ok) {
      toast.success(`${deleteTarget.ticker} removed`);
      setDeleteTarget(null);
      handleDataChanged();
    } else {
      console.error("[dashboard] Delete failed:", res.error);
      toast.error("Could not remove holding.");
    }
  }

  const gainTone = summary.totalGain >= 0 ? "up" : "down";

  const BOTS: { key: AssetClass; label: string; icon: React.ElementType }[] = [
    { key: "stock", label: "Stock Bot", icon: LineChart },
    { key: "crypto", label: "Crypto Bot", icon: Bitcoin },
  ];

  // In guest preview, the named member sections are shown but locked behind an
  // overlay; otherwise they render normally.
  const Gate = ({
    title,
    description,
    children,
  }: {
    title: string;
    description?: string;
    children: React.ReactNode;
  }) =>
    preview ? (
      <LockedSection title={title} description={description}>
        {children}
      </LockedSection>
    ) : (
      <>{children}</>
    );

  return (
    <MarketIntelProvider bot={bot}>
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3 sm:gap-4">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">
            {preview ? "Live preview" : `Welcome back, ${userName.split(" ")[0]}`}
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight sm:text-3xl">
            {bot === "crypto" ? "Crypto portfolio" : "Stock portfolio"} overview
          </h1>
        </div>
        {preview ? (
          <Button asChild className="font-semibold shadow-glow">
            <Link href="/register">
              <Sparkles className="mr-2 size-4" /> Create free account
            </Link>
          </Button>
        ) : (
        <div className="flex flex-wrap items-center gap-2">
          <GlobalSearch onPick={handleSearchPick} />
          <Button
            variant="outline"
            onClick={handleRefreshPrices}
            disabled={refreshing || stocks.length === 0}
          >
            {refreshing ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 size-4" />
            )}
            Refresh prices
          </Button>
          {atLimit ? (
            <Button asChild className="font-semibold shadow-glow">
              <Link href="/pricing">
                <Sparkles className="mr-2 size-4" /> Upgrade to add more
              </Link>
            </Button>
          ) : (
            <Button onClick={openAdd} className="font-semibold shadow-glow">
              <Plus className="mr-2 size-4" /> Add holding
            </Button>
          )}
        </div>
        )}
      </div>

      {/* ───────────────────────── 1 · Preview banner (guests) OR subscription details ───────────────────────── */}
      {preview ? (
        <div className="mt-6 overflow-hidden rounded-3xl border border-primary/30 bg-gradient-to-br from-primary/12 via-card/50 to-card/50 p-6 shadow-glow sm:p-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                <Sparkles className="size-4" /> You're viewing a live preview
              </div>
              <h2 className="mt-2 font-display text-xl font-bold tracking-tight sm:text-2xl">
                Create a free account to unlock your dashboard
              </h2>
              <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-muted-foreground">
                Explore everything below. Your portfolio overview, holdings, transaction centre,
                alerts and report centre are member features — sign up to activate them and start
                tracking live across NZX, ASX, US equities, crypto &amp; metals.
              </p>
            </div>
            <div className="flex shrink-0 flex-col gap-2 sm:w-auto">
              <Button asChild className="font-semibold shadow-glow">
                <Link href="/register">Create free account</Link>
              </Button>
              <Button asChild variant="outline" className="font-semibold">
                <Link href="/login">Sign in</Link>
              </Button>
            </div>
          </div>
        </div>
      ) : (
      <div className="mt-6 rounded-3xl border border-border/70 bg-gradient-to-br from-primary/8 to-card/50 p-6">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <BadgeCheck className="size-4 text-primary" /> Your subscription
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <BadgeCheck className="size-3.5 text-primary" /> Plan
            </div>
            <p className="mt-1.5 font-display text-lg font-bold">{planLabel(subscription.plan)}</p>
            <p className="text-xs text-muted-foreground">{botAccessLabel(subscription.botAccess)}</p>
          </div>
          <div>
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <Layers className="size-3.5 text-primary" /> Ticker limit
            </div>
            <p className="mt-1.5 font-display text-lg font-bold">
              {tickerLimit} {scope === "total" ? "across both bots" : "per bot"}
            </p>
            <p className="text-xs text-muted-foreground">
              Status: <span className="capitalize">{subscription.status || "none"}</span>
            </p>
          </div>
          <div>
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <CalendarClock className="size-3.5 text-primary" /> Purchased
            </div>
            <p className="mt-1.5 font-display text-lg font-bold">{fmtDate(subscription.startedAt)}</p>
          </div>
          <div>
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <CalendarClock className="size-3.5 text-primary" /> Expires
            </div>
            <p className="mt-1.5 font-display text-lg font-bold">{fmtDate(subscription.expiresAt)}</p>
          </div>
        </div>

        {/* Ticker-quota status line */}
        <div
          className={cn(
            "mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-5 py-3.5",
            atLimit ? "border-[var(--gold)]/40 bg-[var(--gold)]/10" : "border-border/60 bg-background/30"
          )}
        >
          <div className="flex items-center gap-2.5 text-sm">
            <span
              className={cn(
                "grid size-8 place-items-center rounded-lg",
                atLimit ? "bg-[var(--gold)]/15 text-[var(--gold)]" : "bg-primary/12 text-primary"
              )}
            >
              <Layers className="size-4" />
            </span>
            <div>
              <p className="font-medium">
                {planLabel(subscription.plan)} ·{" "}
                <span className="tnum">
                  {monitoredForLimit}/{tickerLimit}
                </span>{" "}
                {scope === "total" ? "tickers monitored" : `${bot} tickers monitored`}
              </p>
              <p className="text-xs text-muted-foreground">
                {atLimit
                  ? "You've reached your plan's monitoring limit — upgrade or remove a holding to add more."
                  : scope === "total"
                    ? "Your plan monitors tickers across both bots combined."
                    : "Each bot gets its own ticker allowance on your plan."}
              </p>
            </div>
          </div>
          {subscription.plan === "free" && (
            <Button asChild size="sm" variant={atLimit ? "default" : "outline"} className="font-semibold">
              <Link href="/pricing">
                <Sparkles className="mr-1.5 size-3.5" /> Upgrade plan
              </Link>
            </Button>
          )}
        </div>
      </div>
      )}

      {/* ───────────────────────── 2 · Market news ───────────────────────── */}
      <div className="mt-8">
        <div className="mb-4 flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-lg bg-primary/12 text-primary">
            <Newspaper className="size-4" />
          </span>
          <h2 className="font-display text-lg font-bold">Market news</h2>
        </div>
        <NewsFeed />
      </div>

      {/* ───────────────────────── 3 · Portfolio overview (gated for guests) ───────────────────────── */}
      <div className="mt-8">
      <Gate
        title="Stock Portfolio Overview"
        description="Your live KPIs — total worth, unrealised P&L, 7-day alpha, portfolio health, Sharpe & win rate."
      >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg font-bold tracking-tight sm:text-xl">
          {bot === "crypto" ? "Crypto" : "Stock"} portfolio overview
        </h2>
        {/* Bot switcher — Stock ⇄ Crypto */}
        <div className="inline-flex rounded-xl border border-border/70 bg-card/50 p-1">
          {BOTS.map((b) => {
            const active = bot === b.key;
            const unlocked = canUseBot(b.key);
            const Icon = b.icon;
            if (!unlocked) {
              return (
                <Link
                  key={b.key}
                  href="/pricing"
                  className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground/70 transition-colors hover:text-foreground"
                  title={`Unlock the ${b.label} on a higher plan`}
                >
                  <Lock className="size-4" /> {b.label}
                </Link>
              );
            }
            return (
              <button
                key={b.key}
                onClick={() => setBot(b.key)}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors",
                  active ? "bg-primary text-primary-foreground shadow-glow" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="size-4" /> {b.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* KPI cards */}
      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={`Total worth · ${baseCurrency}`}
          value={formatMoney(summary.totalValue, baseCurrency)}
          sub={`Cost basis ${formatMoney(summary.totalCost, baseCurrency)}`}
          icon={Wallet}
        />
        <StatCard
          label="Unrealized P&L"
          value={formatMoney(summary.totalGain, baseCurrency)}
          sub={formatPercent(summary.totalGainPct)}
          icon={summary.totalGain >= 0 ? TrendingUp : TrendingDown}
          tone={gainTone}
        />
        <StatCard
          label="7-Day alpha potential"
          value={`${metrics.alphaPotentialPct >= 0 ? "+" : ""}${metrics.alphaPotentialPct.toFixed(2)}%`}
          sub={
            summary.holdingsCount
              ? `${formatMoney(metrics.alphaPotentialValue, baseCurrency)} projected move`
              : "Add holdings to project"
          }
          icon={Zap}
          tone={metrics.alphaPotentialPct >= 0 ? "up" : "down"}
        />
        <StatCard
          label="Portfolio health"
          value={summary.holdingsCount ? `${metrics.healthScore}/100` : "—"}
          sub={summary.holdingsCount ? metrics.healthLabel : "No holdings yet"}
          icon={HeartPulse}
          tone={
            !summary.holdingsCount
              ? "neutral"
              : metrics.healthScore >= 55
                ? "up"
                : metrics.healthScore >= 38
                  ? "neutral"
                  : "down"
          }
        />
      </div>

      {/* Risk / quality metrics strip */}
      {summary.holdingsCount > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-4 rounded-2xl border border-border/70 bg-card/40 p-4 sm:grid-cols-4">
          <MiniMetric icon={Activity} label="Ann. volatility" value={`${metrics.volatility.toFixed(1)}%`} />
          <MiniMetric icon={Gauge} label="Sharpe ratio" value={metrics.sharpe.toFixed(2)} />
          <MiniMetric icon={PieChart} label="Diversification" value={`${metrics.diversification}%`} />
          <MiniMetric icon={Trophy} label="Win rate" value={`${metrics.winRate}%`} />
        </div>
      )}
      </Gate>
      </div>

      {/* ───────────────────────── 4 · Totals owned (Stocks · Crypto · Cash · Metals) ───────────────────────── */}
      <div className="mt-8 rounded-3xl border border-border/70 bg-gradient-to-br from-primary/8 to-card/50 p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Landmark className="size-4 text-primary" /> Totals owned
            </div>
            <p className="text-xs text-muted-foreground">Everything you hold, valued live in NZD</p>
          </div>
          {/* Live-updating market value + net worth — animates as prices move */}
          <div className="flex items-end gap-6">
            <div className="text-right">
              <p className="text-[0.68rem] uppercase tracking-wide text-muted-foreground">Holdings value · NZD</p>
              <AnimatedMoney
                value={holdingsValueNZD}
                currency="NZD"
                className="font-display text-lg font-bold text-foreground"
              />
            </div>
            <div className="text-right">
              <p className="flex items-center justify-end gap-1.5 text-[0.68rem] uppercase tracking-wide text-muted-foreground">
                <span className="relative flex size-1.5">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400/70" />
                  <span className="relative inline-flex size-1.5 rounded-full bg-emerald-400" />
                </span>
                Total net worth · NZD
              </p>
              <AnimatedMoney
                value={netWorthNZD}
                currency="NZD"
                className="font-display text-2xl font-bold text-primary"
              />
            </div>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* CASH BAL — the anchor. Debited on every buy (stocks/crypto/metals),
              credited on every sell. Deliberately styled to stand out. */}
          <div className="relative overflow-hidden rounded-2xl border border-primary/40 bg-gradient-to-br from-primary/20 via-primary/10 to-card/40 p-5 shadow-glow">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wide text-primary">Cash Bal</span>
              <span className="grid size-8 place-items-center rounded-lg bg-primary/20 text-primary">
                <Wallet className="size-4" />
              </span>
            </div>
            <AnimatedMoney
              value={cashBalance}
              currency="NZD"
              className="mt-3 block font-display text-3xl font-bold text-primary"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Cash available · falls on every buy, rises on every sell
            </p>
            <div className="mt-3 flex items-center justify-between border-t border-primary/20 pt-2 text-xs">
              <span className="text-muted-foreground">Holdings value</span>
              <AnimatedMoney value={holdingsValueNZD} currency="NZD" className="font-semibold text-foreground" />
            </div>
          </div>
          <StatCard
            label="Value in Stocks · NZD"
            value={formatMoney(stockTotalNZD, "NZD")}
            sub={`${stockHoldings.length} position${stockHoldings.length === 1 ? "" : "s"}`}
            icon={LineChart}
          />
          <StatCard
            label="Value in Crypto · NZD"
            value={formatMoney(cryptoTotalNZD, "NZD")}
            sub={`${cryptoHoldings.length} coin${cryptoHoldings.length === 1 ? "" : "s"}`}
            icon={Bitcoin}
          />
          <StatCard
            label="Value in Metals · NZD"
            value={formatMoney(metalsValueNZD, "NZD")}
            sub={metalsEntitled ? "Gold & silver at spot" : "Bonus for paid members"}
            icon={Coins}
          />
        </div>

        {/* Sector allocation for the active bot */}
        {summary.sectorAllocation.length > 0 && (
          <div className="mt-5 rounded-2xl border border-border/60 bg-background/30 p-5">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <PieChart className="size-4 text-primary" /> {bot === "crypto" ? "Crypto" : "Stock"} allocation
            </div>
            <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-muted/40">
              {summary.sectorAllocation.map((s, i) => (
                <div
                  key={s.sector}
                  style={{
                    width: `${s.weight}%`,
                    backgroundColor: SECTOR_COLORS[i % SECTOR_COLORS.length],
                  }}
                  title={`${s.sector} · ${s.weight.toFixed(1)}%`}
                />
              ))}
            </div>
            <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
              {summary.sectorAllocation.map((s, i) => (
                <div key={s.sector} className="flex items-center gap-3">
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: SECTOR_COLORS[i % SECTOR_COLORS.length] }}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm">{s.sector}</span>
                  <span className="tnum text-sm text-muted-foreground">
                    {formatMoney(s.value, baseCurrency, { compact: true })}
                  </span>
                  <span className="tnum w-12 text-right text-sm font-medium">{s.weight.toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ───────────────────────── 5 · Holdings table (gated for guests) ───────────────────────── */}
      <div className="mt-8">
      <Gate
        title="Your Holdings"
        description="Track every position live — shares, cost, current price, market value and gain/loss."
      >
      <div className="rounded-3xl border border-border/70 bg-card/50">
        <div className="flex items-center justify-between border-b border-border/60 px-6 py-4">
          <h2 className="font-display text-lg font-bold">Your holdings</h2>
          <span className="text-xs text-muted-foreground">{summary.holdingsCount} positions</span>
        </div>

        {loading ? (
          <div className="space-y-3 p-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-muted/40" />
            ))}
          </div>
        ) : summary.holdings.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <span className="grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary">
              <Wallet className="size-7" />
            </span>
            <p className="mt-4 font-medium">Your portfolio is empty</p>
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">
              Buy your first shares in the Transaction Center below to start tracking gains, losses, and allocation.
            </p>
            <Button onClick={openAdd} className="mt-5 font-semibold">
              <Plus className="mr-2 size-4" /> Add your first holding
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-6 py-3"><HoldingHead label="Ticker" k="ticker" align="left" /></th>
                  <th className="px-3 py-3"><HoldingHead label="Purchase date" k="date" align="left" /></th>
                  <th className="px-3 py-3"><HoldingHead label="Company name" k="company" align="left" /></th>
                  <th className="px-3 py-3 font-medium">Exchange</th>
                  <th className="px-3 py-3"><HoldingHead label="# shares" k="shares" /></th>
                  <th className="px-3 py-3"><HoldingHead label="Price paid / share" k="purchase_price" /></th>
                  <th className="px-3 py-3"><HoldingHead label="Current price / share" k="current_price" /></th>
                  <th className="px-3 py-3"><HoldingHead label="Market value" k="marketValue" /></th>
                  <th className="px-3 py-3"><HoldingHead label="% of Portfolio" k="weight" /></th>
                  <th className="px-3 py-3"><HoldingHead label="Gain / Loss" k="gain" /></th>
                  <th className="px-6 py-3 text-right font-medium sr-only">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedHoldings.map((h) => {
                  const up = h.gain >= 0;
                  const exchange = exchangeForTicker(h.ticker, h.asset_type);
                  return (
                    <tr
                      key={h._id}
                      className="border-b border-border/40 transition-colors last:border-0 hover:bg-background/40"
                    >
                      {/* Ticker — click to open the last-7-days performance chart */}
                      <td className="px-6 py-3.5">
                        <button
                          type="button"
                          onClick={() =>
                            setChartTarget({
                              ticker: h.ticker,
                              symbol: h.ticker.replace(/\.(NZ|AX|L)$/, ""),
                              name: h.company_name || h.sector || h.ticker,
                              exchange,
                              currency: h.currency,
                              purchasePrice: h.purchase_price,
                              currentPrice: h.current_price,
                            })
                          }
                          className="group/tk flex items-center gap-3 rounded-lg text-left transition-colors hover:text-primary"
                          title={`View last 7 days of ${h.ticker.replace(/\.(NZ|AX|L)$/, "")}`}
                        >
                          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/12 font-display text-xs font-bold text-primary transition-colors group-hover/tk:bg-primary/20">
                            {h.ticker.replace(/\.(NZ|AX|L)$/, "").slice(0, 4)}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <p className="font-semibold underline-offset-4 group-hover/tk:underline">
                              {h.ticker.replace(/\.(NZ|AX|L)$/, "")}
                            </p>
                            <LineChart className="size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover/tk:opacity-100" />
                            <span
                              className="rounded bg-muted/60 px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wide text-muted-foreground"
                              title={CURRENCY_META[h.currency].label}
                            >
                              {h.currency}
                            </span>
                          </div>
                        </button>
                      </td>
                      {/* Purchase date */}
                      <td className="px-3 py-3.5">
                        <span className="tnum whitespace-nowrap text-sm text-muted-foreground">
                          {formatHoldingDate(h.purchase_date)}
                        </span>
                      </td>
                      {/* Company name */}
                      <td className="px-3 py-3.5">
                        <p className="max-w-[16rem] truncate text-muted-foreground">
                          {h.company_name || h.sector || "—"}
                        </p>
                      </td>
                      {/* Exchange */}
                      <td className="px-3 py-3.5">
                        <span className="rounded-md border border-border/60 bg-background/40 px-2 py-0.5 text-[0.7rem] font-semibold text-muted-foreground">
                          {exchange}
                        </span>
                      </td>
                      {/* # shares */}
                      <td className="tnum px-3 py-3.5 text-right text-muted-foreground">
                        {formatNumber(h.shares)}
                      </td>
                      {/* Price paid / share */}
                      <td className="tnum px-3 py-3.5 text-right text-muted-foreground">
                        {formatMoney(h.purchase_price, h.currency)}
                      </td>
                      {/* Current price / share */}
                      <td className="tnum px-3 py-3.5 text-right">
                        {formatMoney(h.current_price, h.currency)}
                      </td>
                      {/* Current total market value */}
                      <td className="tnum px-3 py-3.5 text-right font-medium">
                        {formatMoney(h.marketValue, h.currency)}
                        {h.currency !== baseCurrency && (
                          <span className="block text-[0.68rem] font-normal text-muted-foreground">
                            ≈ {formatMoney(h.baseValue, baseCurrency)}
                          </span>
                        )}
                      </td>
                      {/* % of Portfolio — this holding's share of total portfolio value */}
                      <td className="px-3 py-3.5 text-right">
                        <div className="flex flex-col items-end gap-1">
                          <span className="tnum font-medium">{h.weight.toFixed(1)}%</span>
                          <span className="h-1 w-16 overflow-hidden rounded-full bg-muted/50">
                            <span
                              className="block h-full rounded-full bg-primary/70"
                              style={{ width: `${Math.min(100, Math.max(2, h.weight))}%` }}
                            />
                          </span>
                        </div>
                      </td>
                      {/* Gain / Loss */}
                      <td className="px-3 py-3.5 text-right">
                        <span className={cn("tnum font-medium", up ? "text-emerald-400" : "text-rose-400")}>
                          {formatMoney(h.gain, h.currency)}
                        </span>
                        <span
                          className={cn("tnum ml-1 block text-xs", up ? "text-emerald-400/80" : "text-rose-400/80")}
                        >
                          {formatPercent(h.gainPct)}
                        </span>
                      </td>
                      {/* Actions */}
                      <td className="px-6 py-3.5">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openEdit(h)}
                            className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                            aria-label={`Edit ${h.ticker}`}
                          >
                            <Pencil className="size-4" />
                          </button>
                          <button
                            onClick={() => setDeleteTarget(h)}
                            className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive"
                            aria-label={`Delete ${h.ticker}`}
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </Gate>
      </div>

      {/* ───────────────────────── 6 · Transaction centre (buy / sell / cash) — gated for guests ───────────────────────── */}
      <div className="mt-8">
      <Gate
        title="Transaction Centre"
        description="Buy, sell, deposit and withdraw — a full ledger of your cash and trades across every asset."
      >
        <TransactionCenter
          holdings={allStocks}
          onChanged={handleDataChanged}
          reloadSignal={ledgerSignal}
          preview={preview}
        />
      </Gate>
      </div>

      {/* Precious Metals — bonus for active paying members (gold & silver) */}
      <div className="mt-6">
        <PreciousMetals entitled={metalsEntitled} plan={subscription.plan} onChanged={handleMetalsChanged} />
      </div>

      {/* ───────────────────────── 6 · Actionable intelligence — SELL/BUY signals + pathways (modular window) ───────────────────────── */}
      <div className="mt-6">
        <CollapsibleSection
          title="Actionable Intelligence"
          subtitle="Live SELL / BUY signals and the pathways behind them"
          icon={Radar}
          defaultOpen
        >
          <ActionableIntelligence stocks={stocks} assetClass={bot} onBought={handleDataChanged} />
        </CollapsibleSection>
      </div>

      {/* ───────────────────────── 6.5 · Crypto Market terminal (Crypto Bot only) — live top 500 + fixed Projected Performers ───────────────────────── */}
      {bot === "crypto" && (
        <div className="mt-8">
          <CryptoMarketSection />
        </div>
      )}

      {/* ───────────────────────── 7 · Market Insights — one modular window: cross-exchange browser, snapshot, movers & projected performers ───────────────────────── */}
      <div className="mt-6">
        <CollapsibleSection
          title="Market Insights"
          subtitle="Cross-exchange browser, open-market snapshot, top movers & projected performers"
          icon={Compass}
        >
          <div className="grid gap-4 lg:grid-cols-2">
            <AllMarkets onBought={handleDataChanged} />
            <OpenMarketSnapshot onBought={handleDataChanged} />
          </div>
          <div className="mt-8">
            <TopMovers />
          </div>
          <div className="mt-8">
            <MarketWidePerformers onBought={handleDataChanged} />
          </div>
        </CollapsibleSection>
      </div>

      {/* ───────────────────────── 10 · Watchlist & share-price alerts (gated for guests) ───────────────────────── */}
      <div className="mt-6">
      <Gate
        title="Alerts"
        description="Set live share-price alerts and a watchlist so you never miss a move on the tickers you follow."
      >
      <div>
        <WatchlistPanel bot={bot} reloadSignal={watchlistSignal} preview={preview} />
      </div>
      <div className="mt-6">
        <PriceAlerts stocks={stocks} preview={preview} />
      </div>
      </Gate>
      </div>

      {/* AI report companion */}
      <div className="mt-6">
        <AnalysisPanel holdingsCount={summary.holdingsCount} />
      </div>

      {/* ───────────────────────── 11 · Report Center (Totalum + Stox + Koins) — gated for guests ───────────────────────── */}
      <div className="mt-8">
      <Gate
        title="Report Centre"
        description="Generate full PDF portfolio reports with market intelligence, indicators and AI insight — emailed to you."
      >
        <ReportCenter
          botAccess={subscription.botAccess}
          plan={subscription.plan}
          scope={scope}
          counts={holdingCounts}
          tickerLimit={tickerLimit}
          onHoldingsChanged={handleDataChanged}
          preview={preview}
        />
      </Gate>
      </div>

      <StockDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        onSaved={handleDataChanged}
        defaultAssetType={bot}
      />

      {/* Last-7-days performance chart for a clicked holding ticker */}
      <HoldingChartDialog
        open={!!chartTarget}
        onOpenChange={(o) => !o && setChartTarget(null)}
        target={chartTarget}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {deleteTarget?.ticker}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes this holding from your portfolio. This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmDelete();
              }}
              disabled={deleting}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {deleting ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" /> Removing…
                </>
              ) : (
                "Remove holding"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
    </MarketIntelProvider>
  );
}
