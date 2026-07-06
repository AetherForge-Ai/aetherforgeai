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
import { TransactionCenter } from "@/components/dashboard/TransactionCenter";
import { AnalysisPanel } from "@/components/dashboard/AnalysisPanel";
import { ReportCenter } from "@/components/dashboard/ReportCenter";
import { PriceAlerts } from "@/components/dashboard/PriceAlerts";
import { PreciousMetals } from "@/components/dashboard/PreciousMetals";
import { YearlyToolkit } from "@/components/dashboard/YearlyToolkit";
import { planLabel } from "@/lib/plans";
import { checkTickerQuota, limitScope, resolveTickerLimit } from "@/lib/entitlements";
import { computePortfolioMetrics } from "@/lib/analytics";
import { MarketSnapshot } from "@/components/dashboard/MarketSnapshot";
import { TopMovers } from "@/components/dashboard/TopMovers";
import { ProjectionsPanel } from "@/components/dashboard/ProjectionsPanel";
import { ActionableIntelligence } from "@/components/dashboard/ActionableIntelligence";
import { NewsFeed } from "@/components/dashboard/NewsFeed";
import { MarketIntelProvider } from "@/components/dashboard/MarketIntelContext";
import { WatchlistPanel } from "@/components/dashboard/WatchlistPanel";
import { GlobalSearch } from "@/components/dashboard/GlobalSearch";
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
  Compass,
  ArrowRight,
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

export function PortfolioDashboard({
  userName,
  subscription,
  metalsEntitled,
}: {
  userName: string;
  subscription: DashboardSubscription;
  /** Precious-metals bonus is unlocked for active paying members (or demo mode). */
  metalsEntitled: boolean;
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
  const [allStocks, setAllStocks] = useState<Stock[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Stock | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Stock | null>(null);
  const [deleting, setDeleting] = useState(false);

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

  useEffect(() => {
    loadStocks();
  }, [loadStocks]);

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
      loadStocks();
    } else {
      console.error("[dashboard] Delete failed:", res.error);
      toast.error("Could not remove holding.");
    }
  }

  const gainTone = summary.totalGain >= 0 ? "up" : "down";
  const isYearly = subscription.plan === "yearly" || subscription.plan === "dual_yearly";

  const BOTS: { key: AssetClass; label: string; icon: React.ElementType }[] = [
    { key: "stock", label: "Stock Bot", icon: LineChart },
    { key: "crypto", label: "Crypto Bot", icon: Bitcoin },
  ];

  return (
    <MarketIntelProvider bot={bot}>
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Welcome back, {userName.split(" ")[0]}</p>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight">
            {bot === "crypto" ? "Crypto portfolio" : "Stock portfolio"} overview
          </h1>
        </div>
        <div className="flex items-center gap-2">
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
      </div>

      {/* Plan quota banner — shows how many monitored tickers remain, and nudges
          free/low-tier members to upgrade once they hit their limit. */}
      <div
        className={cn(
          "mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-5 py-3.5",
          atLimit
            ? "border-[var(--gold)]/40 bg-[var(--gold)]/10"
            : "border-border/60 bg-card/40"
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

      {/* Bot switcher — Stock ⇄ Crypto */}
      <div className="mt-5 inline-flex rounded-xl border border-border/70 bg-card/50 p-1">
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

      {/* KPI cards */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
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

      {/* Actionable intelligence — SELL/BUY signals + pathways (prominent) */}
      <div className="mt-6">
        <ActionableIntelligence stocks={stocks} assetClass={bot} />
      </div>

      {/* Subscription summary */}
      <div className="mt-6 rounded-3xl border border-border/70 bg-gradient-to-br from-primary/8 to-card/50 p-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
      </div>

      {/* Report Center — run the full SuperGrok report engine */}
      <div className="mt-6">
        <ReportCenter
          botAccess={subscription.botAccess}
          plan={subscription.plan}
          scope={scope}
          counts={holdingCounts}
          tickerLimit={tickerLimit}
          onHoldingsChanged={loadStocks}
        />
      </div>

      {/* Share-price alerts with execution instructions */}
      <div className="mt-6">
        <PriceAlerts stocks={stocks} />
      </div>

      {/* Annual-member Excel toolkit */}
      {isYearly && (
        <div className="mt-6">
          <YearlyToolkit />
        </div>
      )}

      {/* Holdings + allocation */}
      <div className="mt-6 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        {/* Holdings table */}
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
                Add your first holding to start tracking gains, losses, and allocation.
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
                    <th className="px-6 py-3 font-medium">Asset</th>
                    <th className="px-3 py-3 text-right font-medium">Shares</th>
                    <th className="px-3 py-3 text-right font-medium">Avg cost</th>
                    <th className="px-3 py-3 text-right font-medium">Price</th>
                    <th className="px-3 py-3 text-right font-medium">Value</th>
                    <th className="px-3 py-3 text-right font-medium">Gain/Loss</th>
                    <th className="px-6 py-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.holdings.map((h) => {
                    const up = h.gain >= 0;
                    return (
                      <tr
                        key={h._id}
                        className="border-b border-border/40 transition-colors last:border-0 hover:bg-background/40"
                      >
                        <td className="px-6 py-3.5">
                          <div className="flex items-center gap-3">
                            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/12 font-display text-xs font-bold text-primary">
                              {h.ticker.slice(0, 4)}
                            </span>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <p className="font-semibold">{h.ticker}</p>
                                <span
                                  className="rounded bg-muted/60 px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wide text-muted-foreground"
                                  title={CURRENCY_META[h.currency].label}
                                >
                                  {h.currency}
                                </span>
                              </div>
                              <p className="truncate text-xs text-muted-foreground">
                                {h.company_name || h.sector || "—"}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="tnum px-3 py-3.5 text-right text-muted-foreground">
                          {formatNumber(h.shares)}
                        </td>
                        <td className="tnum px-3 py-3.5 text-right text-muted-foreground">
                          {formatMoney(h.purchase_price, h.currency)}
                        </td>
                        <td className="tnum px-3 py-3.5 text-right">
                          {formatMoney(h.current_price, h.currency)}
                        </td>
                        <td className="tnum px-3 py-3.5 text-right font-medium">
                          {formatMoney(h.marketValue, h.currency)}
                          {h.currency !== baseCurrency && (
                            <span className="block text-[0.68rem] font-normal text-muted-foreground">
                              ≈ {formatMoney(h.baseValue, baseCurrency)}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3.5 text-right">
                          <span
                            className={cn(
                              "tnum font-medium",
                              up ? "text-emerald-400" : "text-rose-400"
                            )}
                          >
                            {formatMoney(h.gain, h.currency)}
                          </span>
                          <span
                            className={cn(
                              "tnum ml-1 block text-xs",
                              up ? "text-emerald-400/80" : "text-rose-400/80"
                            )}
                          >
                            {formatPercent(h.gainPct)}
                          </span>
                        </td>
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

        {/* Sector allocation */}
        <div className="rounded-3xl border border-border/70 bg-card/50 p-6">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-lg bg-primary/12 text-primary">
              <PieChart className="size-4" />
            </span>
            <h2 className="font-display text-lg font-bold">Allocation</h2>
          </div>

          {summary.sectorAllocation.length === 0 ? (
            <p className="mt-6 text-sm text-muted-foreground">
              Allocation appears once you add holdings.
            </p>
          ) : (
            <>
              {/* Stacked bar */}
              <div className="mt-6 flex h-3 overflow-hidden rounded-full bg-muted/40">
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
              <div className="mt-5 space-y-3">
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
                    <span className="tnum w-12 text-right text-sm font-medium">
                      {s.weight.toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Transaction Center — buy/sell/deposit/withdraw with realized P&L + cash */}
      <div className="mt-6">
        <TransactionCenter holdings={allStocks} onChanged={loadStocks} />
      </div>

      {/* Precious Metals — bonus for active paying members (gold & silver) */}
      <div className="mt-6">
        <PreciousMetals entitled={metalsEntitled} plan={subscription.plan} />
      </div>

      {/* Totalum — the master architect that unifies stocks + crypto + metals */}
      <div className="mt-6">
        <Link
          href="/totalum"
          className="group relative flex flex-col gap-4 overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-violet-500/12 via-primary/10 to-transparent p-5 transition-all hover:border-primary/50 hover:shadow-glow sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full bg-primary/15 blur-3xl" />
          <div className="relative flex items-start gap-4">
            <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/25">
              <Compass className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold">Totalum · Master Portfolio Architect</h3>
                <span className="rounded-md bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                  Pro
                </span>
              </div>
              <p className="mt-1 max-w-xl text-sm text-muted-foreground">
                Unify your stocks, crypto & precious metals into one strategy — allocation, rebalancing, scenarios,
                stress tests and a Chief Strategist AI.
              </p>
            </div>
          </div>
          <span className="relative inline-flex items-center gap-1.5 self-start rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground sm:self-auto">
            Open Totalum <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        </Link>
      </div>

      {/* Watchlist — tracked symbols for the active bot */}
      <div className="mt-6">
        <WatchlistPanel bot={bot} reloadSignal={watchlistSignal} />
      </div>

      {/* Market snapshot — NZX | ASX | US (or Crypto) */}
      <div className="mt-8">
        <MarketSnapshot />
      </div>

      {/* Top movers */}
      <div className="mt-6">
        <TopMovers />
      </div>

      {/* 7-day projections with technical indicators */}
      <div className="mt-6">
        <ProjectionsPanel />
      </div>

      {/* AI Report */}
      <div className="mt-6">
        <AnalysisPanel holdingsCount={summary.holdingsCount} />
      </div>

      {/* Market news */}
      <div className="mt-6">
        <NewsFeed />
      </div>

      <StockDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        onSaved={loadStocks}
        defaultAssetType={bot}
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
