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
import { HoldingsOwnedTable } from "@/components/dashboard/HoldingsOwnedTable";
import { ActionableIntelligence } from "@/components/dashboard/ActionableIntelligence";
import { DashboardSectionTitle } from "@/components/dashboard/DashboardSectionTitle";
import { MarketIntelProvider } from "@/components/dashboard/MarketIntelContext";
import { WatchlistPanel } from "@/components/dashboard/WatchlistPanel";
import { OverviewHubCard } from "@/components/dashboard/OverviewHubCard";
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
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Compass,
  ArrowLeft,
  FileSpreadsheet,
  Bell,
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
  if ((assetType || "stock") === "metal") return "Metals";
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
            tone === "up" && "bg-emerald-500/15 text-emerald-600",
            tone === "down" && "bg-rose-500/15 text-rose-600",
            tone === "neutral" && "bg-primary/12 text-primary"
          )}
        >
          <Icon className="size-4" />
        </span>
      </div>
      <p
        className={cn(
          "tnum mt-3 font-display text-2xl font-bold",
          tone === "up" && "text-emerald-600",
          tone === "down" && "text-rose-600"
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

export type DashboardView = "home" | "stocks" | "crypto" | "metals";

export function PortfolioDashboard({
  userName,
  subscription,
  metalsEntitled,
  preview = false,
  view = "home",
}: {
  userName: string;
  subscription: DashboardSubscription;
  /** Precious-metals bonus is unlocked for active paying members (or demo mode). */
  metalsEntitled: boolean;
  /** Guest preview — dashboard is visible but the member sections are locked. */
  preview?: boolean;
  /** home = totals + hub cards; stocks/crypto/metals = full hub pages. */
  view?: DashboardView;
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
  // Raw precious_metal holdings (from /api/metals) so we can surface them in the
  // main Transaction Center Sell/Remove list and unify the two systems.
  const [preciousMetalHoldings, setPreciousMetalHoldings] = useState<
    { _id: string; metal: "gold" | "silver"; ounces: number; purchase_price_per_oz: number }[]
  >([]);
  const [metalSpot, setMetalSpot] = useState<{
    gold: { nzdPerOz: number };
    silver: { nzdPerOz: number };
  } | null>(null);
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
  // Also keeps the full holding list so Transaction Center Sell/Remove can show
  // Gold & Silver bought via the dedicated Precious Metals section.
  const loadMetals = useCallback(async () => {
    const res = await api.get<{
      metals: {
        _id: string;
        metal: "gold" | "silver";
        ounces: number;
        purchase_price_per_oz: number;
      }[];
      spot: { gold: { nzdPerOz: number }; silver: { nzdPerOz: number } };
    }>("/api/metals");
    if (res.ok && res.data?.spot) {
      const { metals, spot } = res.data;
      const list = metals || [];
      const total = list.reduce(
        (sum, m) => sum + m.ounces * (spot[m.metal]?.nzdPerOz ?? 0),
        0
      );
      setMetalsValueNZD(total);
      setPreciousMetalHoldings(list);
      setMetalSpot(spot);
    } else {
      // Not entitled / no metals — simply contributes 0 to the totals.
      setMetalsValueNZD(0);
      setPreciousMetalHoldings([]);
      setMetalSpot(null);
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

  // Dedicated overviews (stock + crypto shown separately — no bot toggle)
  const stockOnly = useMemo(
    () => allStocks.filter((s) => (s.asset_type || "stock") === "stock"),
    [allStocks]
  );
  const cryptoOnly = useMemo(
    () => allStocks.filter((s) => s.asset_type === "crypto"),
    [allStocks]
  );
  const stockOverviewSummary = useMemo(
    () => computeSummary(stockOnly, { baseCurrency: "NZD", fxToNZD }),
    [stockOnly, fxToNZD]
  );
  const stockOverviewMetrics = useMemo(() => computePortfolioMetrics(stockOnly), [stockOnly]);
  const cryptoOverviewSummary = useMemo(
    () => computeSummary(cryptoOnly, { baseCurrency: "USD", fxToNZD }),
    [cryptoOnly, fxToNZD]
  );
  const cryptoOverviewMetrics = useMemo(() => computePortfolioMetrics(cryptoOnly), [cryptoOnly]);

  // Gold & silver bought through the Buy/Sell window are stored in the `stock`
  // table as `asset_type:"metal"`. They must surface in the Holdings table
  // regardless of which bot (Stox/Koins) is active, so the table uses its own
  // summary that folds the active bot's positions together with all metals.
  const metalStocks = useMemo(
    () => allStocks.filter((s) => (s.asset_type || "stock") === "metal"),
    [allStocks]
  );

  // Precious-metal holdings from the dedicated /api/metals table, mapped into
  // the same Stock shape so the Transaction Center Sell/Remove picker can show
  // them alongside ordinary positions. Marked with metalSourceId so the sell
  // path knows to call DELETE /api/metals/[id] instead of the normal sell.
  const preciousAsStocks = useMemo((): (Stock & { metalSourceId?: string })[] => {
    if (!preciousMetalHoldings.length) return [];
    return preciousMetalHoldings.map((m) => {
      const ticker = m.metal === "gold" ? "GOLD" : "SILVER";
      const spot = metalSpot?.[m.metal]?.nzdPerOz ?? m.purchase_price_per_oz;
      return {
        _id: `pm-${m._id}`, // prefix so it never collides with a real stock _id
        ticker,
        asset_type: "metal" as const,
        company_name: m.metal === "gold" ? "Gold bullion" : "Silver bullion",
        shares: m.ounces,
        purchase_price: m.purchase_price_per_oz,
        current_price: spot,
        metalSourceId: m._id, // original precious_metal record id
      };
    });
  }, [preciousMetalHoldings, metalSpot]);

  // Combined list for Transaction Center (main holdings + precious metals).
  // Prefer the precious_metal source when both systems somehow have the same metal
  // so selling goes through the correct API.
  const transactionHoldings = useMemo(() => {
    const fromStocks = allStocks.filter((s) => {
      // Drop any main-table metal rows that would duplicate a precious_metal entry.
      if ((s.asset_type || "stock") !== "metal") return true;
      const t = s.ticker.toUpperCase();
      return !preciousAsStocks.some((pm) => pm.ticker === t);
    });
    return [...fromStocks, ...preciousAsStocks];
  }, [allStocks, preciousAsStocks]);

  const tableStocks = useMemo(() => {
    // Avoid double-listing if the active bot ever coincided with metals.
    const seen = new Set(stocks.map((s) => s._id));
    return [...stocks, ...metalStocks.filter((m) => !seen.has(m._id))];
  }, [stocks, metalStocks]);
  const tableSummary = useMemo(
    () => computeSummary(tableStocks, { baseCurrency, fxToNZD }),
    [tableStocks, baseCurrency, fxToNZD]
  );

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
    const val = (h: (typeof tableSummary.holdings)[number]): number | string => {
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
    return [...tableSummary.holdings].sort((a, b) => {
      const av = val(a);
      const bv = val(b);
      if (typeof av === "string" && typeof bv === "string") return av.localeCompare(bv) * mult;
      return ((av as number) - (bv as number)) * mult;
    });
  }, [tableSummary.holdings, holdingSort]);

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
  // Gold/silver positions bought via the Buy/Sell window (stored in `stock`).
  const metalStockTotalNZD = useMemo(
    () => computeSummary(metalStocks, { baseCurrency: "NZD", fxToNZD }).totalValue,
    [metalStocks, fxToNZD]
  );
  // Live market value of everything held (excludes idle cash) + full net worth.
  // `metalsValueNZD` = the precious_metal bonus store; `metalStockTotalNZD` =
  // metals traded through the ledger — distinct records, so no double-count.
  const holdingsValueNZD = stockTotalNZD + cryptoTotalNZD + metalsValueNZD + metalStockTotalNZD;
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

  // In guest preview, the named member sections are shown but locked behind an
  // overlay; otherwise they render normally.
  const isHome = view === "home";
  const isStocksHub = view === "stocks";
  const isCryptoHub = view === "crypto";
  const isMetalsHub = view === "metals";

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
      ) : null}

      {!isHome && (
        <div className="mt-4">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition hover:text-foreground"
          >
            <ArrowLeft className="size-4" /> Back to Dashboard
          </Link>
          <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <h1 className="font-grift-black text-3xl tracking-tight text-amber-400 sm:text-4xl">
                {isStocksHub
                  ? "Stock Portfolio Overview"
                  : isCryptoHub
                    ? "Crypto Portfolio Overview"
                    : "Metals Portfolio Overview"}
              </h1>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                Your positions first, then AI reports, high-conviction buys &amp; sells, share-price alerts,
                market insights and watchlist — in one professional workspace.
              </p>
            </div>
            <div className="rounded-2xl border border-amber-400/30 bg-amber-400/5 px-4 py-3 text-right">
              <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-amber-600/90">
                {isStocksHub ? "Stocks · NZD" : isCryptoHub ? "Crypto · NZD" : "Metals · NZD"}
              </p>
              <p className="font-display text-2xl font-bold text-foreground">
                {formatMoney(
                  isStocksHub
                    ? stockTotalNZD
                    : isCryptoHub
                      ? cryptoTotalNZD
                      : metalsValueNZD + metalStockTotalNZD,
                  "NZD",
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                {isStocksHub
                  ? `${stockHoldings.length} position${stockHoldings.length === 1 ? "" : "s"}`
                  : isCryptoHub
                    ? `${cryptoHoldings.length} coin${cryptoHoldings.length === 1 ? "" : "s"}`
                    : "Gold & silver"}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ───────────────────────── 4 · Totals owned (Stocks · Crypto · Cash · Metals) ───────────────────────── */}
      <div className={cn("mt-8 rounded-3xl border border-border/70 bg-gradient-to-br from-primary/8 to-card/50 p-6", !isHome && "hidden")}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div>
              <h2 className="font-grift-black text-3xl tracking-tight text-amber-400 sm:text-4xl">Totals owned</h2>
              <p className="mt-1 text-sm text-muted-foreground">Everything you hold, valued live in NZD</p>
            </div>
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
            value={formatMoney(metalsValueNZD + metalStockTotalNZD, "NZD")}
            sub={
              metalStocks.length > 0
                ? `${metalStocks.length} bullion position${metalStocks.length === 1 ? "" : "s"} + spot`
                : metalsEntitled
                  ? "Gold & silver at spot"
                  : "Bonus for paid members"
            }
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


      <div className={cn("mt-8 grid grid-cols-1 gap-4 md:grid-cols-3", !isHome && "hidden")}>
        <OverviewHubCard
          href="/dashboard/stocks"
          title="Stock Portfolio Overview"
          subtitle="Equities across NZX · ASX · US markets"
          value={formatMoney(stockTotalNZD, "NZD")}
          meta={`${stockHoldings.length} position${stockHoldings.length === 1 ? "" : "s"} · open for holdings, reports & intel`}
          icon={LineChart}
          avatarSrc="/brand/bot-stox-fullbody.png"
        />
        <OverviewHubCard
          href="/dashboard/crypto"
          title="Crypto Portfolio Overview"
          subtitle="Coins valued live · institutional terminal"
          value={formatMoney(cryptoTotalNZD, "NZD")}
          meta={`${cryptoHoldings.length} coin${cryptoHoldings.length === 1 ? "" : "s"} · open for holdings, reports & intel`}
          icon={Bitcoin}
          avatarSrc="/brand/bot-koins-fullbody.png"
          accent="violet"
        />
        <OverviewHubCard
          href="/dashboard/metals"
          title="Metals Portfolio Overview"
          subtitle="Gold & silver at spot · Smitty"
          value={formatMoney(metalsValueNZD + metalStockTotalNZD, "NZD")}
          meta="Bullion & metal positions · open for holdings, reports & intel"
          icon={Coins}
          avatarSrc="/brand/bot-smitty-fullbody.png"
          accent="amber"
        />
      </div>


      {/* ───────────────────────── 3 · Stock portfolio overview ───────────────────────── */}
      <div className={cn("mt-10", !(isStocksHub) && "hidden")}>
      <Gate
        title="Stock Portfolio Overview"
        description="Your live KPIs — total worth, unrealised P&L, 7-day alpha, portfolio health, Sharpe & win rate."
      >
        <DashboardSectionTitle
          title="Stock Portfolio Overview"
          avatarSrc="/brand/bot-stox-fullbody.png"
          avatarAlt="Stox AI bot"
          avatarPose="lean"
        />

      {/* KPI cards — stocks */}
      <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total worth · NZD"
          value={formatMoney(stockOverviewSummary.totalValue, "NZD")}
          sub={`Cost basis ${formatMoney(stockOverviewSummary.totalCost, "NZD")}`}
          icon={Wallet}
        />
        <StatCard
          label="Unrealized P&L"
          value={formatMoney(stockOverviewSummary.totalGain, "NZD")}
          sub={formatPercent(stockOverviewSummary.totalGainPct)}
          icon={stockOverviewSummary.totalGain >= 0 ? TrendingUp : TrendingDown}
          tone={stockOverviewSummary.totalGain >= 0 ? "up" : "down"}
        />
        <StatCard
          label="7-Day alpha potential"
          value={`${stockOverviewMetrics.alphaPotentialPct >= 0 ? "+" : ""}${stockOverviewMetrics.alphaPotentialPct.toFixed(2)}%`}
          sub={
            stockOverviewSummary.holdingsCount
              ? `${formatMoney(stockOverviewMetrics.alphaPotentialValue, "NZD")} projected move`
              : "Add holdings to project"
          }
          icon={Zap}
          tone={stockOverviewMetrics.alphaPotentialPct >= 0 ? "up" : "down"}
        />
        <StatCard
          label="Portfolio health"
          value={stockOverviewSummary.holdingsCount ? `${stockOverviewMetrics.healthScore}/100` : "—"}
          sub={stockOverviewSummary.holdingsCount ? stockOverviewMetrics.healthLabel : "No holdings yet"}
          icon={HeartPulse}
          tone={
            !stockOverviewSummary.holdingsCount
              ? "neutral"
              : stockOverviewMetrics.healthScore >= 55
                ? "up"
                : stockOverviewMetrics.healthScore >= 38
                  ? "neutral"
                  : "down"
          }
        />
      </div>

      {stockOverviewSummary.holdingsCount > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-4 rounded-2xl border border-border/70 bg-card/40 p-4 sm:grid-cols-4">
          <MiniMetric icon={Activity} label="Ann. volatility" value={`${stockOverviewMetrics.volatility.toFixed(1)}%`} />
          <MiniMetric icon={Gauge} label="Sharpe ratio" value={stockOverviewMetrics.sharpe.toFixed(2)} />
          <MiniMetric icon={PieChart} label="Diversification" value={`${stockOverviewMetrics.diversification}%`} />
          <MiniMetric icon={Trophy} label="Win rate" value={`${stockOverviewMetrics.winRate}%`} />
        </div>
      )}

      <HoldingsOwnedTable
        title="Stocks you own"
        emptyLabel="No stocks in this portfolio yet"
        emptyHint="Buy shares in the Transaction Centre below — they'll show here under Stock Portfolio Overview."
        holdings={stockOverviewSummary.holdings}
        baseCurrency="NZD"
        loading={loading}
        onAdd={openAdd}
        onEdit={openEdit}
        onDelete={setDeleteTarget}
        onOpenChart={setChartTarget}
      />
      </Gate>
      </div>

      {/* ───────────────────────── 3b · Crypto currency overview ───────────────────────── */}
      <div className={cn("mt-10", !(isCryptoHub) && "hidden")}>
      <Gate
        title="Crypto Currency Overview"
        description="Live crypto KPIs and market terminal — total worth, unrealised P&L, health and projected movers."
      >
        <DashboardSectionTitle
          title="Crypto Currency Overview"
          avatarSrc="/brand/bot-koins-fullbody.png"
          avatarAlt="Koins AI bot"
          avatarPose="flip"
        />

      <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total worth · USD"
          value={formatMoney(cryptoOverviewSummary.totalValue, "USD")}
          sub={`Cost basis ${formatMoney(cryptoOverviewSummary.totalCost, "USD")}`}
          icon={Wallet}
        />
        <StatCard
          label="Unrealized P&L"
          value={formatMoney(cryptoOverviewSummary.totalGain, "USD")}
          sub={formatPercent(cryptoOverviewSummary.totalGainPct)}
          icon={cryptoOverviewSummary.totalGain >= 0 ? TrendingUp : TrendingDown}
          tone={cryptoOverviewSummary.totalGain >= 0 ? "up" : "down"}
        />
        <StatCard
          label="7-Day alpha potential"
          value={`${cryptoOverviewMetrics.alphaPotentialPct >= 0 ? "+" : ""}${cryptoOverviewMetrics.alphaPotentialPct.toFixed(2)}%`}
          sub={
            cryptoOverviewSummary.holdingsCount
              ? `${formatMoney(cryptoOverviewMetrics.alphaPotentialValue, "USD")} projected move`
              : "Add coins to project"
          }
          icon={Zap}
          tone={cryptoOverviewMetrics.alphaPotentialPct >= 0 ? "up" : "down"}
        />
        <StatCard
          label="Portfolio health"
          value={cryptoOverviewSummary.holdingsCount ? `${cryptoOverviewMetrics.healthScore}/100` : "—"}
          sub={cryptoOverviewSummary.holdingsCount ? cryptoOverviewMetrics.healthLabel : "No holdings yet"}
          icon={HeartPulse}
          tone={
            !cryptoOverviewSummary.holdingsCount
              ? "neutral"
              : cryptoOverviewMetrics.healthScore >= 55
                ? "up"
                : cryptoOverviewMetrics.healthScore >= 38
                  ? "neutral"
                  : "down"
          }
        />
      </div>

      {cryptoOverviewSummary.holdingsCount > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-4 rounded-2xl border border-border/70 bg-card/40 p-4 sm:grid-cols-4">
          <MiniMetric icon={Activity} label="Ann. volatility" value={`${cryptoOverviewMetrics.volatility.toFixed(1)}%`} />
          <MiniMetric icon={Gauge} label="Sharpe ratio" value={cryptoOverviewMetrics.sharpe.toFixed(2)} />
          <MiniMetric icon={PieChart} label="Diversification" value={`${cryptoOverviewMetrics.diversification}%`} />
          <MiniMetric icon={Trophy} label="Win rate" value={`${cryptoOverviewMetrics.winRate}%`} />
        </div>
      )}

      <HoldingsOwnedTable
        title="Crypto you own"
        emptyLabel="No crypto in this portfolio yet"
        emptyHint="Buy coins in the Transaction Centre — they'll show here so you can see where the money is."
        holdings={cryptoOverviewSummary.holdings}
        baseCurrency="USD"
        loading={loading}
        onAdd={openAdd}
        onEdit={openEdit}
        onDelete={setDeleteTarget}
        onOpenChart={setChartTarget}
      />

      <div className="mt-6">
        <CryptoMarketSection />
      </div>
      </Gate>
      </div>

      {/* ───────────────────────── 3c · Precious metals (moved up for page flow) ───────────────────────── */}
      <div className={cn("mt-10 space-y-6", !(isMetalsHub) && "hidden")}>
        <PreciousMetals entitled={metalsEntitled} plan={subscription.plan} onChanged={handleMetalsChanged} />
        <HoldingsOwnedTable
          title="Metals you own"
          emptyLabel="No metal positions yet"
          emptyHint="Buy gold or silver in this hub — they'll list here so you can see where the money is."
          holdings={computeSummary(
            [...metalStocks, ...preciousAsStocks.filter((pm) => !metalStocks.some((m) => m.ticker === pm.ticker))],
            { baseCurrency: "NZD", fxToNZD },
          ).holdings}
          baseCurrency="NZD"
          loading={loading}
          onAdd={openAdd}
          onEdit={openEdit}
          onDelete={setDeleteTarget}
          onOpenChart={setChartTarget}
        />
      </div>

      {/* ───────────────────────── 5 · Holdings table (gated for guests) ───────────────────────── */}
      <div className={cn("mt-8", !(false) && "hidden")}>
      <Gate
        title="Your Holdings"
        description="Track every position live — shares, cost, current price, market value and gain/loss."
      >
      <div className="rounded-3xl border border-border/70 bg-card/50">
        <div className="flex items-center justify-between border-b border-border/60 px-6 py-4">
          <h2 className="font-display text-lg font-bold">Your holdings</h2>
          <span className="text-xs text-muted-foreground">{tableSummary.holdingsCount} positions</span>
        </div>

        {loading ? (
          <div className="space-y-3 p-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-muted/40" />
            ))}
          </div>
        ) : tableSummary.holdings.length === 0 ? (
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
                        <span className={cn("tnum font-medium", up ? "text-emerald-600" : "text-rose-600")}>
                          {formatMoney(h.gain, h.currency)}
                        </span>
                        <span
                          className={cn("tnum ml-1 block text-xs", up ? "text-emerald-600/80" : "text-rose-600/80")}
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
      <div className={cn("mt-8", !(isHome) && "hidden")}>
      <Gate
        title="Transaction Centre"
        description="Buy, sell, deposit and withdraw — a full ledger of your cash and trades across every asset."
      >
        <TransactionCenter
          holdings={transactionHoldings}
          onChanged={handleDataChanged}
          reloadSignal={ledgerSignal}
          preview={preview}
        />
  
      {/* ──── Hub intelligence suite (stock / crypto / metals overview pages) ──── */}
      <div className={cn("mt-10 space-y-5", isHome && "hidden")}>
        <div className="border-b border-border/50 pb-3">
          <h2 className="font-grift-black text-2xl tracking-tight text-amber-400">Portfolio intelligence</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            AI reports, high-conviction buys &amp; sells, alerts, insights and your watchlist for this book.
          </p>
        </div>

        <div>
          <Gate
            title="Report Centre"
            description="AI bot reports generated for your portfolio — Headmaster, Stox and Koins."
          >
            <CollapsibleSection
              title="AI Report Centre"
              subtitle="Reports your bots have generated so far — run new ones any time"
              icon={FileSpreadsheet}
              defaultOpen
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
            </CollapsibleSection>
          </Gate>
        </div>

        <div>
          <CollapsibleSection
            title="High-conviction buys & sells"
            subtitle="Actionable intelligence — SELL signals from holdings and BUY candidates not yet held"
            icon={Radar}
            defaultOpen
          >
            <ActionableIntelligence
              stocks={isCryptoHub ? cryptoOnly : isMetalsHub ? metalStocks : stockOnly}
              assetClass={isCryptoHub ? "crypto" : "stock"}
              onBought={handleDataChanged}
            />
          </CollapsibleSection>
        </div>

        <div>
          <Gate
            title="Alerts"
            description="Live share-price alerts and watchlist for the tickers you follow."
          >
            <CollapsibleSection
              title="Watchlist & share-price alerts"
              subtitle="Never miss a move on the names you track"
              icon={Bell}
              defaultOpen
            >
              <div className="space-y-6">
                <WatchlistPanel
                  bot={isCryptoHub ? "crypto" : "stock"}
                  reloadSignal={watchlistSignal}
                  preview={preview}
                />
                <PriceAlerts
                  stocks={isCryptoHub ? cryptoOnly : isMetalsHub ? metalStocks : stockOnly}
                  preview={preview}
                />
              </div>
            </CollapsibleSection>
          </Gate>
        </div>

        <div>
          <CollapsibleSection
            title="Market Insights"
            subtitle="Cross-exchange browser, open-market snapshot, top movers and projected performers"
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

        <div>
          <AnalysisPanel holdingsCount={isCryptoHub ? cryptoOverviewSummary.holdingsCount : isStocksHub ? stockOverviewSummary.holdingsCount : metalStocks.length} />
        </div>
      </div>

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
