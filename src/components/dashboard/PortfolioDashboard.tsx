"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { api } from "@/lib/api";
import type { TradeEditFields } from "@/lib/ledger-row-edit";
import {
  collapseDuplicateHoldings,
  computeSummary,
  formatPercent,
  formatNumber,
  type HoldingMetrics,
  type Stock,
} from "@/lib/portfolio";
import {
  formatDisplayDate,
  formatSignedMoney,
  formatMoney,
  formatNzd,
  roundMoney,
  sumRoundedMoney,
  formatUnitPrice,
  currencyForTicker,
  baseCurrencyForBot,
  BASELINE_FX_TO_NZD,
  CURRENCY_META,
  usdToNzd,
  type FxRatesToNZD,
  type CurrencyCode,
} from "@/lib/currency";
import {
  isBullionHolding,
  inferMetalKey,
  isListedStockHolding,
  lastGoodUnitPrice,
  markBookAtBullionSpot,
  type MetalSpotPerOz,
} from "@/lib/metal-valuation";
import { hubAllocationLabel } from "@/lib/hub-labels";
import { dexFromHolding, holdingTitle } from "@/lib/dex-source";
import { portfolioLoadFailure } from "@/lib/trade-commit-session";
import type { HoldingChartTarget } from "@/components/dashboard/HoldingChartDialog";

const HoldingChartDialog = dynamic(
  () => import("@/components/dashboard/HoldingChartDialog").then((mod) => mod.HoldingChartDialog),
  { ssr: false }
);
function ReportCenterFallback() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading reports">
      <div className="h-16 animate-pulse rounded-2xl bg-muted/50 motion-reduce:animate-none" />
      <div className="grid gap-4 md:grid-cols-3">
        <div className="h-32 animate-pulse rounded-2xl bg-muted/40 motion-reduce:animate-none" />
        <div className="h-32 animate-pulse rounded-2xl bg-muted/40 motion-reduce:animate-none" />
        <div className="h-32 animate-pulse rounded-2xl bg-muted/40 motion-reduce:animate-none" />
      </div>
    </div>
  );
}

const ReportCenter = dynamic(
  () => import("@/components/dashboard/ReportCenter").then((mod) => mod.ReportCenter),
  { ssr: false, loading: () => <ReportCenterFallback /> },
);
const DashboardInsights = dynamic(
  () => import("@/components/dashboard/DashboardInsights").then((mod) => mod.DashboardInsights),
  { ssr: false },
);
import { TransactionCenter } from "@/components/dashboard/TransactionCenter";
import { openRecordTransaction } from "@/lib/open-transaction";
import { computeHoldingSplit, ReturnsSplitCard } from "@/components/dashboard/ReturnsSplitCard";
import {
  clearPortfolioSnapshotCache,
  paintConfirmedSnapshot,
  readPortfolioSnapshotCache,
  snapshotAsReturnSplit,
  writePortfolioSnapshotCache,
  type PortfolioSnapshot,
  type SnapshotClass,
  type SnapshotFigure,
  type SnapshotLedgerLine,
  type SnapshotPosition,
} from "@/lib/portfolio-snapshot";
import { isTransactionDialogOpen } from "@/lib/transaction-sticky";
import {
  acceptAccountPayload,
  bindActiveAccount,
  getAccountEpoch,
  getActiveAccountUserId,
  responseUserId,
  trackAccountRequest,
} from "@/lib/account-identity";
import {
  getTxDialogSnapshot,
  holdingsHydrateAction,
  subscribeTxDialog,
} from "@/lib/transaction-dialog-store";
import {
  bindClientUser,
  readCachedBook,
  readCachedCashNZD,
  writeCachedBook,
  writeCachedCashNZD,
} from "@/lib/client-user-state";
import { AnalysisPanel } from "@/components/dashboard/AnalysisPanel";
import { PriceAlerts } from "@/components/dashboard/PriceAlerts";
import WatchAlerts from "@/components/dashboard/WatchAlerts";
import { PreciousMetals } from "@/components/dashboard/PreciousMetals";
import { planLabel } from "@/lib/plans";
import { CSV_LOCK_LABEL, csvLockAccessibleName } from "@/lib/csv-lock-label";
import { checkTickerQuota, isFreeReportPlan, limitScope, resolveTickerLimit } from "@/lib/entitlements";
import { PL_AT_LATEST_PRICE } from "@/lib/market-freshness";
import { CRYPTO_PROJECTIONS_PAUSED, CRYPTO_PROJECTIONS_PAUSE_MESSAGE } from "@/lib/projection-pause";
import { computePortfolioMetrics } from "@/lib/analytics";
import { AllMarkets } from "@/components/dashboard/AllMarkets";
import { OpenMarketSnapshot } from "@/components/dashboard/OpenMarketSnapshot";
import { AnimatedMoney } from "@/components/dashboard/AnimatedMoney";
import { TopMovers } from "@/components/dashboard/TopMovers";
import { MarketWidePerformers } from "@/components/dashboard/MarketWidePerformers";
import { CryptoMarketSection } from "@/components/dashboard/crypto/CryptoMarketSection";
import { CryptoLiveStatus } from "@/components/dashboard/crypto/CryptoLiveStatus";
import { applyLiveCryptoPrices } from "@/lib/crypto-live";
import {
  applyBookedTradeToHoldings,
  bookedGuardAfterEvent,
  isPendingBookedRow,
  retainBookedHolding,
  reviewBookedSnapshot,
  type BookedGuard,
  type BookedTrade,
} from "@/lib/apply-booked-trade";
import { beginHoldingsRequest, holdingsActionAfterDialogClose, holdingsGeneration, holdingsRequestIsCurrent, holdingsResponseIsStale } from "@/lib/holdings-generation";
import { resumeCryptoLivePoll, useLiveCryptoQuotes } from "@/hooks/useLiveCryptoQuotes";
import { useCryptoMarkets } from "@/hooks/useCryptoMarkets";
import { HoldingsOwnedTable } from "@/components/dashboard/HoldingsOwnedTable";
import { HoldingsCsvImport } from "@/components/dashboard/HoldingsCsvImport";
import { ActionableIntelligence } from "@/components/dashboard/ActionableIntelligence";
import { DashboardSectionTitle } from "@/components/dashboard/DashboardSectionTitle";
import { MarketIntelProvider } from "@/components/dashboard/MarketIntelContext";
import { WatchlistPanel } from "@/components/dashboard/WatchlistPanel";
import { DashboardRail } from "@/components/dashboard/rail/DashboardRail";
import { GlobalSearch } from "@/components/dashboard/GlobalSearch";
import { DashboardCalculator } from "@/components/dashboard/DashboardCalculator";
import { FREE_REPORTS_PER_MONTH } from "@/lib/entitlements";
import { SnapshotAllocation } from "@/components/dashboard/SnapshotAllocation";
import { holdingDeleteEffect } from "@/lib/dashboard-tabs";
import { QUOTA_NOT_LOADED, unloadedReportControl, type ReportDeskSnapshot } from "@/lib/report-quota-display";
import { isStoxOrKoinsRun } from "@/lib/report-body";
import type { ReportsResponse } from "@/components/dashboard/ReportCenter";
import { resolveHoldingAction } from "@/lib/holding-action";
import type { HoldingsRowModel } from "@/lib/holdings-table";
import { duplicateHomeFiguresVisible } from "@/lib/home-totals";
import { DashboardHomeGrid } from "@/components/dashboard/DashboardHomeGrid";
import { OnboardingChecklist } from "@/components/dashboard/OnboardingChecklist";
import { AllocationDriftCard } from "@/components/dashboard/AllocationDriftCard";
import { IndexMarketCard } from "@/components/dashboard/IndexMarketCard";
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
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Compass,
  Radar,
} from "lucide-react";
import Link from "next/link";

export type DashboardView =
  | "home"
  | "cash"
  | "stocks"
  | "crypto"
  | "metals"
  | "transactions"
  | "alerts"
  | "bots"
  | "nzsx"
  | "asx"
  | "nasdaq"
  | "dow";

export interface DashboardSubscription {
  status?: string | null;
  plan?: string | null;
  startedAt?: string | null;
  expiresAt?: string | null;
  tickerLimit?: number | null;
  botAccess: "stock" | "crypto" | "both" | "none";
}

function fmtDate(iso?: string | null): string {
  return formatDisplayDate(iso);
}

/** Derive the listing exchange for a holding from its ticker suffix. */
// Compact, readable purchase date (e.g. "15 Jul 2026"). Legacy rows without a
// stored date render an em-dash so the column never looks broken.
function formatHoldingDate(iso?: string | null): string {
  return formatDisplayDate(iso);
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
  loading = false,
  title,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  tone?: "neutral" | "up" | "down";
  /** Never flash NZ$0 / empty KPIs while cash+holdings+marks hydrate. */
  loading?: boolean;
  title?: string | null;
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
            tone === "up" && "bg-emerald-500/15 text-emerald-700",
            tone === "down" && "bg-rose-500/15 text-rose-600",
            tone === "neutral" && "bg-primary/12 text-primary"
          )}
        >
          <Icon className="size-4" />
        </span>
      </div>
      {loading ? (
        <div className="mt-3 space-y-2" aria-busy="true">
          <div className="h-8 w-28 animate-pulse rounded-md bg-muted/50" aria-hidden />
          <p className="text-xs text-muted-foreground">Loading…</p>
        </div>
      ) : (
        <p
          className={cn(
            "tnum mt-3 font-display text-2xl font-bold",
            tone === "up" && "text-emerald-700",
            tone === "down" && "text-rose-600",
            value === "—" && "text-muted-foreground"
          )}
          title={title || undefined}
        >
          {value}
        </p>
      )}
      {sub && !loading && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function BookMoney({
  value,
  reason,
  loading,
  className,
  skeletonClassName,
  snap = false,
}: {
  value: number | null;
  reason?: string | null;
  loading: boolean;
  className?: string;
  skeletonClassName: string;
  snap?: boolean;
}) {
  if (loading) return <div className={skeletonClassName} aria-hidden />;
  if (value == null || !Number.isFinite(value)) {
    return (
      <p className={cn("text-muted-foreground", className)} title={reason || "This figure was not stored."}>
        —
      </p>
    );
  }
  return <AnimatedMoney snap={snap} value={value} currency="NZD" className={className} />;
}

function snapshotGroup(snapshot: PortfolioSnapshot | null, id: SnapshotClass): SnapshotFigure | null {
  return snapshot?.groups.find((group) => group.id === id)?.marketValue ?? null;
}

function openSnapshotPositions(snapshot: PortfolioSnapshot | null, id: SnapshotClass): SnapshotPosition[] {
  return (snapshot?.groups.find((group) => group.id === id)?.positions || []).filter(
    (position) => !position.closed && position.quantity > 1e-9
  );
}

/** Table rows priced from the snapshot, so the NZ$ column adds up to that group card. */
function rowsFromSnapshot(
  positions: SnapshotPosition[],
  stocks: Stock[],
  assetType: "stock" | "crypto" | "metal",
  pending: BookedTrade | null = null
): HoldingMetrics[] {
  const rows = positions.map((position) => {
    const stock = stocks.find(
      (row) =>
        row.ticker.toUpperCase() === position.ticker.toUpperCase() &&
        (row.asset_type || "stock") === assetType
    );
    const price = position.marketPriceLocal;
    const paid = position.averageCostLocal;
    const nativeValue = price != null ? position.quantity * price : Number.NaN;
    const nativeCost = paid != null ? position.quantity * paid : Number.NaN;
    const nativeGain = price != null && paid != null ? nativeValue - nativeCost : Number.NaN;
    return {
      _id: stock?._id || position.ticker,
      ticker: position.ticker,
      asset_type: assetType,
      company_name: position.name,
      sector: stock?.sector,
      shares: position.quantity,
      purchase_price: paid ?? Number.NaN,
      current_price: price ?? Number.NaN,
      purchase_date: position.lots[0]?.acquired || stock?.purchase_date || null,
      venue: stock?.venue,
      chain: stock?.chain,
      currency: (position.currency || "NZD") as CurrencyCode,
      costBasis: nativeCost,
      marketValue: nativeValue,
      gain: nativeGain,
      gainPct: nativeCost > 0 && Number.isFinite(nativeGain) ? (nativeGain / nativeCost) * 100 : Number.NaN,
      baseValue: position.marketValue.value ?? Number.NaN,
      weight: position.weight.value != null ? position.weight.value * 100 : Number.NaN,
    };
  });
  const seen = new Set(rows.map((row) => row.ticker.toUpperCase()));
  const extras = pending
    ? stocks.filter(
        (stock) =>
          (stock.asset_type || "stock") === assetType &&
          isPendingBookedRow(stock, pending) &&
          !seen.has(stock.ticker.toUpperCase())
      )
    : [];
  for (const stock of extras) {
    const price = Number(stock.current_price);
    const paid = Number(stock.purchase_price);
    const qty = Number(stock.shares);
    const nativeValue = price > 0 ? qty * price : Number.NaN;
    const nativeCost = paid > 0 ? qty * paid : Number.NaN;
    const nativeGain = price > 0 && paid > 0 ? nativeValue - nativeCost : Number.NaN;
    rows.push({
      _id: stock._id,
      ticker: stock.ticker,
      asset_type: assetType,
      company_name: stock.company_name,
      sector: stock.sector,
      shares: qty,
      purchase_price: paid,
      current_price: price,
      purchase_date: stock.purchase_date || null,
      venue: stock.venue,
      chain: stock.chain,
      currency: currencyForTicker(stock.ticker, assetType),
      costBasis: nativeCost,
      marketValue: nativeValue,
      gain: nativeGain,
      gainPct: nativeCost > 0 && Number.isFinite(nativeGain) ? (nativeGain / nativeCost) * 100 : Number.NaN,
      baseValue: Number.NaN,
      weight: Number.NaN,
    });
  }
  return rows;
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


/** Stable gate wrapper — MUST live outside the dashboard component so React
 *  does not treat it as a new component type on every parent render (which
 *  remounts children and wipes open Buy/Add dialog state on ledger refresh).
 *  Always render <DashboardGate preview={…}> directly — never re-wrap it in an
 *  inline `const Gate = …` alias (that undoes this fix and dismisses TC search). */
function DashboardGate({
  preview,
  title,
  description,
  children,
}: {
  preview: boolean;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  if (preview) {
    return (
      <LockedSection title={title} description={description}>
        {children}
      </LockedSection>
    );
  }
  return <>{children}</>;
}

/** Delay before the second snapshot read after a sell, so realised matches the ledger CSV without a reload. */
const SELL_SNAPSHOT_REREAD_MS = 1500;

export function PortfolioDashboard({
  userName,
  userId = null,
  subscription,
  metalsEntitled,
  preview = false,
  view = "home",
}: {
  userName: string;
  /** Authenticated user id — scopes cash cache + sticky Buy/Add; null in guest preview. */
  userId?: string | null;
  subscription: DashboardSubscription;
  /** Precious-metals bonus is unlocked for active paying members (or demo mode). */
  metalsEntitled: boolean;
  /** Guest preview — dashboard is visible but the member sections are locked. */
  preview?: boolean;
  /** Which dashboard window/page to render. */
  view?: DashboardView;
}) {
  // Active bot (Stock or Crypto). Defaults to the only bot the plan unlocks.
  const defaultBot: AssetClass = subscription.botAccess === "crypto" ? "crypto" : "stock";
  const [bot, setBot] = useState<AssetClass>(defaultBot);
  const [watchlistSignal, setWatchlistSignal] = useState(0);

  // Bind before child effects fetch. Account identity is the only user the
  // dashboard may hydrate; a later response for anyone else is discarded.
  if (!preview) bindActiveAccount(userId ?? null);

  // Bind module sticky + purge legacy unscoped cash whenever the authenticated user changes.
  useEffect(() => {
    if (preview) {
      bindClientUser(null);
      bindActiveAccount(null);
      return;
    }
    bindActiveAccount(userId ?? null);
    bindClientUser(userId ?? null);
  }, [preview, userId]);

  // When the authenticated user changes, rehydrate cash only from THAT user's cache.
  useEffect(() => {
    if (preview) return;
    const cached = readCachedCashNZD(userId);
    if (cached != null) {
      setCashBalance(cached);
      setCashLoaded(true);
    } else {
      setCashBalance(0);
      setCashLoaded(false);
    }
    setRecentLedger([]);
    if (!preview) setLedgerLoaded(false);
    const book = readCachedBook(userId);
    if (!book) return;
    setAllStocks(book.stocks as Stock[]);
    setCashBalance(book.cash);
    setMetalsValueNZD(book.metals);
    setIncomeNzd(book.incomeNzd || 0);
    setCostFx(book.costFx || {});
    setQtyFx(book.qtyFx || {});
    setRealisedFxNzd(book.realisedFxNzd || 0);
    setCashLoaded(true);
    setMetalsLoaded(true);
    setLoading(false);
    holdingsHydratedRef.current = true;
  }, [preview, userId]);

  // Keep the active bot in step with the hub page so crypto alerts/holdings
  // receive crypto positions (not leftover stock filters) on /dashboard/crypto.
  useEffect(() => {
    if (view === "crypto") setBot("crypto");
    else if (view === "stocks") setBot("stock");
  }, [view]);

  // Live FX rates (1 unit → NZD) so AUD (.AX) / USD holdings convert into the
  // Stox NZD "Total Worth". Falls back to the baseline table if the feed misses.
  const [fxToNZD, setFxToNZD] = useState<FxRatesToNZD>(BASELINE_FX_TO_NZD);
  const [cryptoBookCurrency, setCryptoBookCurrency] = useState<CurrencyCode>("NZD");
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
  /** After first /api/stocks hydrate — later overlays may be deferred while Buy/Add is open. */
  const holdingsHydratedRef = useRef(!!preview);
  const cashEpochRef = useRef(0);
  const expectedTxRef = useRef<string | null>(null);
  const mutationCashRef = useRef<number | null>(null);
  /**
   * Latest accepted holdings body while Buy/Add is open. Applied when the
   * dialog closes so the stocks hub does not reconcile under an in-progress
   * BAP search. Includes the first hydrate (transactions already deferred
   * only the later overlays; stocks dismissed on the first one).
   */
  const deferredHoldingsRef = useRef<{
    rows: Stock[];
    userId: string | null;
    epoch: number;
    generation: number;
  } | null>(null);
  const [loading, setLoading] = useState(!preview);
  const [refreshing, setRefreshing] = useState(false);
  // Separate from holdings `loading` so KPIs never flash NZ$0 before cash/metals land.
  const [cashLoaded, setCashLoaded] = useState(() => {
    if (preview) return true;
    return readCachedCashNZD(userId) != null;
  });
  const [ledgerLoaded, setLedgerLoaded] = useState(!!preview);
  const [metalsLoaded, setMetalsLoaded] = useState(!!preview);
  const [bookSnapshot, setBookSnapshot] = useState<PortfolioSnapshot | null>(() =>
    preview ? null : readPortfolioSnapshotCache(userId)
  );
  const [snapshotReady, setSnapshotReady] = useState(
    () => preview || readPortfolioSnapshotCache(userId) != null
  );
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  // Cash (NZD) + precious-metals value (NZD) power the "Totals owned" strip.
  // Scoped by userId — never rehydrate another account's balance from sessionStorage.
  const [cashBalance, setCashBalance] = useState(() => {
    if (preview) return PREVIEW_CASH_NZD;
    return readCachedCashNZD(userId) ?? 0;
  });
  const [recentLedger, setRecentLedger] = useState<
    {
      type?: string;
      ticker?: string | null;
      amount?: number | null;
      total?: number | null;
      cash_nzd?: number | null;
      fees_nzd?: number | null;
      quantity?: number | null;
      executed_at?: string | null;
      notes?: string | null;
    }[]
  >([]);
  const [incomeNzd, setIncomeNzd] = useState(0);
  const [costFx, setCostFx] = useState<Record<string, number>>({});
  const [qtyFx, setQtyFx] = useState<Record<string, number>>({});
  const [realisedFxNzd, setRealisedFxNzd] = useState(0);
  const headerPaint = useRef<{ holdings: number | null; net: number | null; stock: number | null; crypto: number | null; metals: number | null; cash: number | null } | null>(null);
  const liveHeaderRef = useRef<{ holdings: number | null; net: number | null; stock: number | null; crypto: number | null; metals: number | null; cash: number | null } | null>(null);
  const [headerFrozen, setHeaderFrozen] = useState(false);
  const [metalsValueNZD, setMetalsValueNZD] = useState(preview ? PREVIEW_METALS_NZD : 0);
  // Raw precious_metal holdings (from /api/metals) so we can surface them in the
  // main Transaction Center Sell/Remove list and unify the two systems.
  const [preciousMetalHoldings, setPreciousMetalHoldings] = useState<
    { _id: string; metal: "gold" | "silver"; ounces: number; purchase_price_per_oz: number }[]
  >([]);
  const [metalSpot, setMetalSpot] = useState<{
    gold: { nzdPerOz: number };
    silver: { nzdPerOz: number };
    live?: boolean;
  } | null>(null);
  // Public troy-oz spot. Independent of the metals-desk entitlement gate so a
  // ledger GOLD lot is marked even when /api/metals is empty or rejected.
  const [publicSpot, setPublicSpot] = useState<
    (MetalSpotPerOz & { live?: boolean; quotedAt?: string | null }) | null
  >(null);
  const [deleteTarget, setDeleteTarget] = useState<Stock | null>(null);
  const [alertSeed, setAlertSeed] = useState<{ ticker: string; nonce: number; asset: "stock" | "crypto" } | null>(null);
  const [watchSeed, setWatchSeed] = useState<{ ticker: string; nonce: number; asset: "stock" | "crypto" } | null>(null);
  const [watchClass, setWatchClass] = useState<"stock" | "crypto">("stock");
  const [alertClass, setAlertClass] = useState<"stock" | "crypto">("stock");
  const [railQuota, setRailQuota] = useState<{ used: number; limit: number } | null>(null);
  // Goal b12 H-4: the allowance comes from a one-count endpoint at mount, so the
  // figure paints in about one round trip; the full report list can follow later.
  useEffect(() => {
    if (preview) return;
    let live = true;
    void fetch("/api/reports/quota", { credentials: "include", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { used?: number | null; limit?: number | null } | null) => {
        if (!live || !d || typeof d.used !== "number" || typeof d.limit !== "number") return;
        const used = d.used;
        const limit = d.limit;
        setRailQuota((current) => current ?? { used, limit });
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [preview]);
  useEffect(() => {
    if (alertSeed) setAlertClass(alertSeed.asset);
  }, [alertSeed]);
  const [reportDesk, setReportDesk] = useState<ReportDeskSnapshot | null>(null);
  const [deskSeed, setDeskSeed] = useState<ReportsResponse | null>(null);
  const [onboardingProbe, setOnboardingProbe] = useState<{ alerts: boolean | null; report: boolean | null; error: boolean }>({
    alerts: null,
    report: null,
    error: false,
  });
  const [probeNonce, setProbeNonce] = useState(0);
  const [probeUser, setProbeUser] = useState(userId);
  if (userId !== probeUser) {
    setProbeUser(userId);
    setDeskSeed(null);
    setOnboardingProbe({ alerts: null, report: null, error: false });
  }
  useEffect(() => {
    if (preview || !userId) return;
    let cancel = false;
    const tracked = trackAccountRequest();
    const timer = window.setTimeout(() => {
      if (cancel) return;
      setOnboardingProbe((prev) => (prev.alerts == null || prev.report == null ? { ...prev, error: true } : prev));
    }, 8_000);
    void (async () => {
      const [reports, alerts] = await Promise.all([
        api.get<ReportsResponse>("/api/reports", { signal: tracked.signal }),
        api.get<unknown[]>("/api/alerts", { signal: tracked.signal }),
      ]);
      if (cancel || reports.aborted) return;
      const reportRows = reports.ok && Array.isArray(reports.data?.reports) ? reports.data.reports : null;
      const alertRows = alerts.ok && Array.isArray(alerts.data) ? alerts.data : null;
      if (reports.ok && reports.data) setDeskSeed(reports.data);
      if (!cancel) {
        setOnboardingProbe({
          alerts: alertRows ? alertRows.length > 0 : null,
          report: reportRows ? reportRows.some((row) => isStoxOrKoinsRun(row)) : null,
          error: !reports.ok || !alerts.ok,
        });
      }
    })();
    return () => {
      cancel = true;
      window.clearTimeout(timer);
      tracked.release();
    };
  }, [preview, userId, probeNonce]);

  const onReportDesk = useCallback((next: ReportDeskSnapshot) => {
    setReportDesk((prev) => {
      if (
        prev &&
        prev.loaded === next.loaded &&
        prev.text === next.text &&
        prev.reason === next.reason &&
        prev.stox.disabled === next.stox.disabled &&
        prev.stox.title === next.stox.title &&
        prev.stox.label === next.stox.label &&
        prev.koins.disabled === next.koins.disabled &&
        prev.koins.title === next.koins.title &&
        prev.koins.label === next.koins.label
      ) {
        return prev;
      }
      return next;
    });
  }, []);
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
  const freePlan = isFreeReportPlan(subscription.plan);
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

  const bookedGuardRef = useRef<BookedGuard | null>(null);
  const [bookedGuard, setBookedGuardState] = useState<BookedGuard | null>(null);
  const setBookedGuard = useCallback((next: BookedGuard | null) => {
    bookedGuardRef.current = next;
    setBookedGuardState(next);
  }, []);
  useEffect(() => {
    setBookedGuard(bookedGuardAfterEvent(bookedGuardRef.current, { type: "account" }));
  }, [userId, setBookedGuard]);
  const loadStocks = useCallback(async (opts?: { fresh?: boolean }) => {
    const capturedGen = holdingsGeneration();
    const requestSeq = beginHoldingsRequest();
    // Never re-arm `loading` after the initial hydrate. Flipping it true again
    // collapses balancesReady (KPI zero-flash) and used to remount Transaction
    // Centre Buy/Add mid ticker-search when live price overlay finished on the
    // existing-holdings path. Initial useState(!preview) already gates first paint.
    const tracked = trackAccountRequest();
    try {
      const path = opts?.fresh ? "/api/stocks?fresh=1" : "/api/stocks";
      const res = await api.get<Stock[]>(path, { signal: tracked.signal });
      if (res.aborted || tracked.epoch !== getAccountEpoch()) return;
      const echoed = responseUserId(res);
      if (res.status === 409 || res.error === "account-mismatch") {
        console.error("[dashboard] Discarding holdings for other/stale user", {
          requestUserId: tracked.userId,
          responseUserId: echoed,
        });
        return;
      }
      if (res.ok && res.data) {
        if (
          !acceptAccountPayload({
            epoch: tracked.epoch,
            requestUserId: tracked.userId,
            responseUserId: echoed,
            rows: res.data,
          })
        ) {
          console.error("[dashboard] Discarding holdings for other/stale user", {
            requestUserId: tracked.userId,
            responseUserId: echoed,
          });
          setLoading(false);
          return;
        }
        // A buy/sell that committed while this request was in flight bumped the
        // generation. The body still has the pre-trade quantity — drop it.
        if (holdingsResponseIsStale(capturedGen) || !holdingsRequestIsCurrent(requestSeq)) {
          console.log("[dashboard] Ignoring holdings snapshot captured before a trade");
          setLoading(false);
          return;
        }
        // Defer EVERY live-price hydrate while Buy/Add is open, including the
        // first one. /dashboard/stocks renders the holdings table and market
        // widgets from this state; committing it mid-search dismissed Buy/Add
        // at the same moment Yahoo returned (~5.5s). /dashboard/transactions
        // stayed open. Flush runs when the dialog closes.
        if (holdingsHydrateAction(isTransactionDialogOpen()) === "defer") {
          deferredHoldingsRef.current = {
            rows: res.data,
            userId: tracked.userId,
            epoch: tracked.epoch,
            generation: capturedGen,
          };
          console.log("[dashboard] Holdings hydrate deferred — Transaction dialog open");
        } else {
          deferredHoldingsRef.current = null;
          setAllStocks((rows) => retainBookedHolding(rows, res.data || [], bookedGuardRef.current?.trade));
          holdingsHydratedRef.current = true;
          setLoading(false);
        }
      } else {
        console.error("[dashboard] Failed to load stocks:", res.error);
        if (portfolioLoadFailure(false, res.status) === "toast") {
          toast.error("Could not load your portfolio.");
        }
        setLoading(false);
      }
    } finally {
      tracked.release();
    }
  }, []);

  // Cash balance (NZD) from the transaction ledger.
  /** Cash + recent rows from /api/transactions — same ledger as the Transactions page. */
  const loadCash = useCallback(async () => {
    const tracked = trackAccountRequest();
    const seenCash = cashEpochRef.current;
    try {
      const res = await api.get<{
        cashBalance: number;
        userId?: string;
        incomeNZD?: number;
        costFxByTicker?: Record<string, number>;
        qtyFxByTicker?: Record<string, number>;
        realisedFxNzd?: number;
        transactions?: {
          _id?: string;
          type?: string;
          ticker?: string;
          total?: number;
          cash_nzd?: number;
          fees_nzd?: number;
          quantity?: number;
          amount?: number;
          executed_at?: string;
          notes?: string;
          user?: string;
        }[];
      }>("/api/transactions", { signal: tracked.signal });
      if (res.aborted || tracked.epoch !== getAccountEpoch()) return;
      const echoed = responseUserId(res);
      if (res.status === 409 || res.error === "account-mismatch") {
        // Leave the user-scoped sessionStorage figure on screen. A late body
        // from the previous account must not replace it — that was the ~8s
        // 1T→TT cash switch.
        console.error("[dashboard] Discarding cash ledger for other/stale user", {
          requestUserId: tracked.userId,
          responseUserId: echoed,
        });
        return;
      }
      if (res.ok && res.data && typeof res.data.cashBalance === "number") {
        if (
          !acceptAccountPayload({
            epoch: tracked.epoch,
            requestUserId: tracked.userId,
            responseUserId: echoed,
            rows: res.data.transactions,
          })
        ) {
          console.error("[dashboard] Discarding cash ledger for other/stale user", {
            requestUserId: tracked.userId,
            responseUserId: echoed,
          });
          return;
        }
        if (seenCash !== cashEpochRef.current) return;
        const requiredId = expectedTxRef.current;
        const loaded = res.data.transactions || [];
        const mutationCash = mutationCashRef.current;
        if (requiredId && !loaded.some((row) => row._id === requiredId)) return;
        if (
          requiredId &&
          mutationCash != null &&
          Math.abs(res.data.cashBalance - mutationCash) >= 0.02
        ) {
          return;
        }
        expectedTxRef.current = null;
        mutationCashRef.current = null;
        const bal = res.data.cashBalance;
        setCashBalance(bal);
        writeCachedCashNZD(tracked.userId, bal);
        const rows = loaded.slice(0, 6).map((r) => ({
          type: r.type,
          ticker: r.ticker ?? null,
          total: r.total ?? null,
          cash_nzd: r.cash_nzd ?? null,
          fees_nzd: r.fees_nzd ?? null,
          quantity: r.quantity ?? null,
          amount: r.total ?? r.amount ?? null,
          executed_at: r.executed_at ?? null,
          notes: r.notes ?? null,
        }));
        setRecentLedger(rows);
        setIncomeNzd(typeof res.data.incomeNZD === "number" ? res.data.incomeNZD : 0);
        setCostFx(res.data.costFxByTicker || {});
        setQtyFx(res.data.qtyFxByTicker || {});
        setRealisedFxNzd(typeof res.data.realisedFxNzd === "number" ? res.data.realisedFxNzd : 0);
        setCashLoaded(true);
        setLedgerLoaded(true);
      } else {
        console.error("[dashboard] Failed to load cash balance:", res.error);
        setCashLoaded(true);
        setLedgerLoaded(true);
      }
    } finally {
      tracked.release();
    }
  }, [userId]);

  // Precious-metals total value (NZD) from live spot × ounces held.
  // Also keeps the full holding list so Transaction Center Sell/Remove can show
  // Gold & Silver bought via the dedicated Precious Metals section.
  const loadMetals = useCallback(async () => {
    const tracked = trackAccountRequest();
    let res: Awaited<ReturnType<typeof api.get<{
      metals: {
        _id: string;
        metal: "gold" | "silver";
        ounces: number;
        purchase_price_per_oz: number;
        user?: string;
      }[];
      spot: { gold: { nzdPerOz: number }; silver: { nzdPerOz: number }; live?: boolean };
    }>>>;
    try {
      res = await api.get("/api/metals", { signal: tracked.signal });
    } finally {
      tracked.release();
    }
    if (res.aborted || tracked.epoch !== getAccountEpoch()) return;
    const echoed = responseUserId(res);
    if (res.status === 409 || res.error === "account-mismatch") {
      console.error("[dashboard] Discarding metals for other/stale user", {
        requestUserId: tracked.userId,
        responseUserId: echoed,
      });
      setMetalsLoaded(true);
      return;
    }
    if (res.ok && res.data?.spot) {
      if (
        !acceptAccountPayload({
          epoch: tracked.epoch,
          requestUserId: tracked.userId,
          responseUserId: echoed,
          rows: res.data.metals,
        })
      ) {
        console.error("[dashboard] Discarding metals for other/stale user", {
          requestUserId: tracked.userId,
          responseUserId: echoed,
        });
        setMetalsLoaded(true);
        return;
      }
      const { metals, spot } = res.data;
      const list = metals || [];
      const total = list.reduce((sum, m) => {
        const mark = lastGoodUnitPrice(spot[m.metal]?.nzdPerOz, null, m.purchase_price_per_oz);
        return sum + m.ounces * mark;
      }, 0);
      setMetalsValueNZD(total);
      setPreciousMetalHoldings(list);
      setMetalSpot(spot);
    } else if (!res.aborted) {
      // Not entitled / no metals — simply contributes 0 to the totals.
      // Cross-account 409s must not wipe a balance we already painted.
      setMetalsValueNZD(0);
      setPreciousMetalHoldings([]);
      setMetalSpot(null);
      setMetalsLoaded(true);
    }
    if (res.ok && res.data?.spot) setMetalsLoaded(true);
  }, []);

  const loadPublicSpot = useCallback(async () => {
    const res = await api.get<MetalSpotPerOz & { live?: boolean; quotedAt?: string | null }>("/api/metals/spot");
    if (res.ok && res.data?.gold) {
      setPublicSpot(res.data);
    }
  }, []);

  useEffect(() => {
    if (preview) return;
    const run = () => {
      void loadPublicSpot();
    };
    const idle = window.requestIdleCallback?.(run);
    const timer = typeof idle === "number" ? null : window.setTimeout(run, 400);
    return () => {
      if (typeof idle === "number") window.cancelIdleCallback?.(idle);
      if (timer != null) window.clearTimeout(timer);
    };
  }, [preview, loadPublicSpot, ledgerSignal]);

  const loadPortfolioSnapshot = useCallback(
    async (opts?: { force?: boolean; stored?: boolean }) => {
      if (preview) return;
      const capturedGen = holdingsGeneration();
      const tracked = trackAccountRequest();
      try {
        const params = new URLSearchParams();
        if (opts?.force) params.set("fresh", "1");
        if (opts?.stored) params.set("marks", "stored");
        const qs = params.toString();
        const path = `/api/portfolio/snapshot${qs ? `?${qs}` : ""}`;
        const res = await api.get<PortfolioSnapshot>(path, { signal: tracked.signal });
        if (res.aborted || tracked.epoch !== getAccountEpoch()) return;
        const echoed = responseUserId(res);
        if (res.status === 409 || res.error === "account-mismatch") return;
        const snapshot = res.data;
        if (
          !res.ok ||
          !snapshot?.asOf ||
          !snapshot.kpis ||
          !acceptAccountPayload({
            epoch: tracked.epoch,
            requestUserId: tracked.userId,
            responseUserId: echoed,
          })
        ) {
          setSnapshotError("The portfolio snapshot did not load.");
          setSnapshotReady(true);
          return;
        }
        if (holdingsResponseIsStale(capturedGen)) {
          console.log("[dashboard] Ignoring portfolio snapshot captured before a trade");
          setSnapshotReady(true);
          return;
        }
        const positions = (snapshot.groups || []).flatMap((group) => group.positions || []);
        const decision = reviewBookedSnapshot(bookedGuardRef.current, positions, Date.now());
        setBookedGuard(decision.guard);
        if (!decision.apply) {
          console.log("[dashboard] Snapshot omitted the coin just booked — keeping the on-screen book");
          setSnapshotReady(true);
          return;
        }
        writePortfolioSnapshotCache(tracked.userId, snapshot);
        setBookSnapshot(snapshot);
        setSnapshotError(null);
        setSnapshotReady(true);
      } catch (err) {
        console.error("[dashboard] Portfolio snapshot failed", err);
        setSnapshotError("The portfolio snapshot did not load.");
        setSnapshotReady(true);
      } finally {
        tracked.release();
      }
    },
    [preview, setBookedGuard, userId]
  );

  useEffect(() => {
    if (preview) return;
    const cached = readPortfolioSnapshotCache(userId);
    setBookSnapshot(cached);
    setSnapshotReady(cached != null);
    setSnapshotError(null);
    const tab = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("tab") : null;
    if (tab === "transactions" && !cached) {
      void (async () => {
        await loadPortfolioSnapshot({ stored: true });
        await loadPortfolioSnapshot({ force: true });
      })();
    } else {
      void loadPortfolioSnapshot();
    }
  }, [preview, userId, loadPortfolioSnapshot]);

  useEffect(() => {
    if (preview) return; // guest preview uses seeded demo data — no network calls
    const tab = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("tab") : null;
    if (tab === "transactions" && !snapshotReady) return;
    loadStocks();
    loadCash();
    loadMetals();
  }, [preview, loadStocks, loadCash, loadMetals, snapshotReady]);

  // Apply a holdings body that arrived while Buy/Add was open. Identity is
  // re-checked so a 1T→TT switch cannot flush the previous account's rows.
  useEffect(() => {
    let wasOpen = getTxDialogSnapshot().open;
    let generationAtOpen: number | null = wasOpen ? holdingsGeneration() : null;
    return subscribeTxDialog(() => {
      const open = getTxDialogSnapshot().open;
      if (open && !wasOpen) generationAtOpen = holdingsGeneration();
      wasOpen = open;
      if (open) return;
      resumeCryptoLivePoll();
      const pending = deferredHoldingsRef.current;
      const action = holdingsActionAfterDialogClose({
        generationAtOpen,
        generationNow: holdingsGeneration(),
        pendingGeneration: pending?.generation ?? null,
      });
      generationAtOpen = null;
      if (action === "keep") return;
      if (action === "apply" && pending) {
        deferredHoldingsRef.current = null;
        if (pending.epoch !== getAccountEpoch() || pending.userId !== getActiveAccountUserId()) {
          console.error("[dashboard] Dropping deferred holdings — account changed");
          return;
        }
        setAllStocks(pending.rows);
        holdingsHydratedRef.current = true;
        setLoading(false);
        return;
      }
      deferredHoldingsRef.current = null;
      console.log("[dashboard] Refetching holdings after the transaction dialog closed");
      void loadStocks();
    });
  }, [loadStocks]);

  // Live net-worth updates — silently re-price holdings every 60s so the totals
  // fluctuate with the market (AnimatedMoney tweens each change smoothly). No
  // toast, no spinner; skipped in guest preview and when nothing is held.
  useEffect(() => {
    if (preview) return;
    const id = setInterval(() => {
      void (async () => {
      if (document.hidden) return; // don't poll a backgrounded tab
      // Round-6: never soft-refresh holdings while Buy/Add is open — live-price
      // overlay re-renders were racing TickerSearch and dismissing the modal.
      if (isTransactionDialogOpen()) {
        console.log("[dashboard] Soft-refresh deferred — Transaction dialog open");
        return;
      }
      const capturedGen = holdingsGeneration();
      const requestSeq = beginHoldingsRequest();
      const tracked = trackAccountRequest();
      try {
      const res = await api.post<Stock[]>("/api/stocks/refresh", {}, { signal: tracked.signal });
      tracked.release();
      if (res.aborted || tracked.epoch !== getAccountEpoch()) return;
      if (holdingsResponseIsStale(capturedGen) || !holdingsRequestIsCurrent(requestSeq)) {
        console.log("[dashboard] Ignoring soft-refresh captured before a trade");
        return;
      }
      if (
        !acceptAccountPayload({
          epoch: tracked.epoch,
          requestUserId: tracked.userId,
          responseUserId: responseUserId(res),
          rows: res.data,
        })
      ) {
        console.error("[dashboard] Discarding soft-refresh holdings for other/stale user");
        return;
      }
      if (res.ok && res.data) {
        if (holdingsHydrateAction(isTransactionDialogOpen()) === "defer") {
          deferredHoldingsRef.current = {
            rows: res.data,
            userId: tracked.userId,
            epoch: tracked.epoch,
            generation: capturedGen,
          };
          console.log("[dashboard] Live re-price tick deferred — Transaction dialog open");
          return;
        }
        deferredHoldingsRef.current = null;
        setAllStocks(res.data);
        holdingsHydratedRef.current = true;
        void loadPortfolioSnapshot({ force: true });
        console.log("[dashboard] Live re-price tick applied");
      } else if (res.status !== 401 && !res.aborted) {
        console.error("[dashboard] Soft-refresh failed:", res.error);
      }
      } finally {
        tracked.release();
      }
      })().catch(() => {
        /* interval must not surface an unhandled rejection */
      });
    }, 60_000);
    return () => clearInterval(id);
  }, [preview, loadPortfolioSnapshot]);

  // Called whenever holdings or cash change (transactions, edits, deletes).
  const applyKnownCash = useCallback(
    (bal: number) => {
      cashEpochRef.current += 1;
      setCashBalance(bal);
      writeCachedCashNZD(userId, bal);
      setCashLoaded(true);
    },
    [userId]
  );
  // Goal b12 G-10: optimistic paint on Confirm. The pre-trade rows are kept so the
  // server's answer (or a failure) replaces the guess instead of stacking on it.
  const allStocksRef = useRef<Stock[]>(allStocks);
  allStocksRef.current = allStocks;
  const optimisticBaseRef = useRef<{ stocks: Stock[]; cash: number } | null>(null);
  const handleDataChanged = useCallback(
    (updated?: {
      cashBalance?: number;
      lastTransaction?: BookedTrade | null;
      optimistic?: boolean;
      optimisticRollback?: boolean;
    }) => {
      if (updated?.optimistic) {
        if (!optimisticBaseRef.current) {
          optimisticBaseRef.current = { stocks: allStocksRef.current, cash: mutationCashRef.current ?? cashBalance };
        }
        if (typeof updated.cashBalance === "number") applyKnownCash(updated.cashBalance);
        if (updated.lastTransaction) setAllStocks((rows) => applyBookedTradeToHoldings(rows, updated.lastTransaction));
        return;
      }
      if (updated?.optimisticRollback) {
        const base = optimisticBaseRef.current;
        optimisticBaseRef.current = null;
        if (base) {
          setAllStocks(base.stocks);
          applyKnownCash(base.cash);
        }
        updated = undefined;
      } else if (optimisticBaseRef.current && updated?.lastTransaction) {
        // Real answer: rebuild from the pre-trade rows so the trade counts once.
        const base = optimisticBaseRef.current.stocks;
        optimisticBaseRef.current = null;
        setAllStocks(base);
      } else {
        optimisticBaseRef.current = null;
      }
      if (updated && typeof updated.cashBalance === "number") {
        mutationCashRef.current = updated.cashBalance;
        applyKnownCash(updated.cashBalance);
      }
      const bookedId = updated?.lastTransaction?._id ? String(updated.lastTransaction._id) : "";
      if (bookedId) expectedTxRef.current = bookedId;
      const hasSnapshot = typeof updated?.cashBalance === "number" || !!updated?.lastTransaction;
      const painted = liveHeaderRef.current;
      if (!hasSnapshot && painted && painted.holdings != null && painted.net != null && painted.cash != null) {
        headerPaint.current = {
          holdings: painted.holdings,
          net: painted.net,
          stock: painted.stock,
          crypto: painted.crypto,
          metals: painted.metals,
          cash: painted.cash,
        };
        setHeaderFrozen(true);
      } else if (hasSnapshot) {
        headerPaint.current = null;
        setHeaderFrozen(false);
      }
      // Cash and the holding quantity land together from this response.
      // A later /api/stocks read can replace marks. It must not paint one side first.
      if (updated?.lastTransaction) {
        setBookedGuard(bookedGuardAfterEvent(bookedGuardRef.current, updated.lastTransaction));
        const pending = deferredHoldingsRef.current;
        if (pending && pending.generation !== holdingsGeneration()) {
          deferredHoldingsRef.current = null;
        }
        setAllStocks((rows) => applyBookedTradeToHoldings(rows, updated.lastTransaction));
        if (typeof updated.cashBalance === "number") {
          const cashNow = updated.cashBalance;
          const trade = updated.lastTransaction;
          setBookSnapshot((current) => (current ? paintConfirmedSnapshot(current, trade, cashNow) : current));
        }
        holdingsHydratedRef.current = true;
        setLoading(false);
      }
      clearPortfolioSnapshotCache(userId);
      const soldNow = String(updated?.lastTransaction?.type || "").toLowerCase() === "sell";
      void Promise.all([loadStocks({ fresh: true }), loadCash(), loadMetals(), loadPortfolioSnapshot({ force: true })])
        .then(async () => {
          // The ledger can take a moment to show the new sell. A second read books FIFO realised to match the CSV.
          if (!soldNow) return;
          await new Promise((resolve) => setTimeout(resolve, SELL_SNAPSHOT_REREAD_MS));
          await loadPortfolioSnapshot({ force: true });
        })
        .finally(() => setHeaderFrozen(false));
    },
    [applyKnownCash, cashBalance, loadStocks, loadCash, loadMetals, loadPortfolioSnapshot, setBookedGuard, userId]
  );

  useEffect(() => {
    const onBook = (event: Event) => {
      const detail = (event as CustomEvent<{ cashBalance?: number }>).detail;
      handleDataChanged(detail);
    };
    window.addEventListener("aetherforge-book-changed", onBook);
    return () => window.removeEventListener("aetherforge-book-changed", onBook);
  }, [handleDataChanged]);

  // Metals buy/sell also moves cash + writes the ledger — reload the top-level
  // totals AND signal the Transaction Center to refresh its ledger/cash cards.
  const handleMetalsChanged = useCallback(() => {
    handleDataChanged();
    setLedgerSignal((n) => n + 1);
  }, [handleDataChanged]);

  // Global-search pick: switch to the matching bot and track the symbol.
  async function handleSearchPick(assetClass: AssetClass, entry: UniverseEntry) {
    if (!canUseBot(assetClass)) {
      toast.error(`Your plan does not include the ${assetClass} bot. Pro includes both Stox and Koins.`, {
        action: { label: "See Pro", onClick: () => { window.location.href = "/pricing#pro"; } },
      });
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
  const valuedHoldings = useMemo(() => collapseDuplicateHoldings(allStocks), [allStocks]);
  const stockOnly = useMemo(
    () => valuedHoldings.filter((s) => isListedStockHolding(s.asset_type, s.ticker, s.company_name)),
    [valuedHoldings]
  );
  const cryptoOnly = useMemo(
    () => valuedHoldings.filter((s) => s.asset_type === "crypto"),
    [valuedHoldings]
  );
  const cryptoLiveSymbols = useMemo(() => cryptoOnly.map((s) => s.ticker), [cryptoOnly]);
  // 24/7 spot poll for this hub only. Buy/Add pauses it inside the hook so a
  // price tick cannot re-render the open modal shut.
  const cryptoSnapshotAt = useRef(0);
  const cryptoLive = useLiveCryptoQuotes(cryptoLiveSymbols, view === "crypto" && !preview);
  const cryptoBoard = useCryptoMarkets(view === "crypto" && !preview);
  const cryptoBoardAt = cryptoBoard.asOf ? Date.parse(cryptoBoard.asOf) : Number.NaN;
  const cryptoMarked = useMemo(
    () => (view === "crypto" ? applyLiveCryptoPrices(cryptoOnly, cryptoLive.quotes) : cryptoOnly),
    [view, cryptoOnly, cryptoLive.quotes]
  );
  useEffect(() => {
    if (preview || !cryptoLive.updatedAt) return;
    const now = Date.now();
    if (now - cryptoSnapshotAt.current < 60_000) return;
    cryptoSnapshotAt.current = now;
    void loadPortfolioSnapshot({ force: true });
  }, [preview, cryptoLive.updatedAt, loadPortfolioSnapshot]);
  const stockOverviewSummary = useMemo(
    () => computeSummary(stockOnly, { baseCurrency: "NZD", fxToNZD }),
    [stockOnly, fxToNZD]
  );
  const stockOverviewMetrics = useMemo(() => computePortfolioMetrics(stockOnly), [stockOnly]);
  const cryptoOverviewSummary = useMemo(
    () => computeSummary(cryptoMarked, { baseCurrency: cryptoBookCurrency, fxToNZD }),
    [cryptoMarked, fxToNZD, cryptoBookCurrency]
  );
  const cryptoOverviewMetrics = useMemo(() => computePortfolioMetrics(cryptoMarked), [cryptoMarked]);

  // Gold & silver bought through Buy/Sell live in the stock table as metal lots.
  // Stock KPIs already exclude them. The stock holdings table uses that same
  // equity filter — bullion is listed only on the metals hub.
  const spotForMarks = publicSpot ?? metalSpot;
  const metalsSpotLive = (publicSpot?.live ?? metalSpot?.live) === true;
  const metalStocks = useMemo(() => {
    const bullion = valuedHoldings.filter((s) => isBullionHolding(s.asset_type, s.ticker, s.company_name));
    // Always rewrite a persisted equity print (~US$44.65) to NZD per troy ounce.
    return markBookAtBullionSpot(bullion, spotForMarks);
  }, [valuedHoldings, spotForMarks]);
  // Precious-metal holdings from the dedicated /api/metals table, mapped into
  // the same Stock shape so the Transaction Center Sell/Remove picker can show
  // them alongside ordinary positions. Marked with metalSourceId so the sell
  // path knows to call DELETE /api/metals/[id] instead of the normal sell.
  const preciousAsStocks = useMemo((): (Stock & { metalSourceId?: string })[] => {
    if (!preciousMetalHoldings.length) return [];
    return preciousMetalHoldings.map((m) => {
      const ticker = m.metal === "gold" ? "GOLD" : "SILVER";
      const live =
        (metalSpot?.[m.metal]?.nzdPerOz ?? 0) > 0 ? metalSpot?.[m.metal]?.nzdPerOz : publicSpot?.[m.metal]?.nzdPerOz;
      const spot = lastGoodUnitPrice(live, null, m.purchase_price_per_oz);
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
  }, [preciousMetalHoldings, metalSpot, publicSpot]);

  // Combined list for Transaction Center (main holdings + precious metals).
  // Prefer the precious_metal source when both systems somehow have the same metal
  // so selling goes through the correct API.
  const transactionHoldings = useMemo(() => {
    const marked = new Map(metalStocks.map((m) => [m._id, m]));
    const fromStocks = allStocks
      .filter((s) => {
        // Drop ledger bullion that duplicates a precious_metal entry.
        if (!isBullionHolding(s.asset_type, s.ticker)) return true;
        const t = s.ticker.toUpperCase();
        return !preciousAsStocks.some((pm) => pm.ticker === t);
      })
      .map((s) => marked.get(s._id) ?? s);
    return [...fromStocks, ...preciousAsStocks];
  }, [allStocks, preciousAsStocks, metalStocks]);

  // Same equity book as Value in Stocks — never append bullion rows.
  const tableStocks = useMemo(
    () => stockOnly.filter((row) => (Number(row.shares) || 0) > 1e-9),
    [stockOnly]
  );
  const tableSummary = useMemo(
    () => computeSummary(tableStocks, { baseCurrency, fxToNZD }),
    [tableStocks, baseCurrency, fxToNZD]
  );
  const snapshotShareRows = useMemo(
    () =>
      preview || !bookSnapshot
        ? null
        : rowsFromSnapshot(openSnapshotPositions(bookSnapshot, "shares"), allStocks, "stock", bookedGuard?.trade ?? null),
    [preview, bookSnapshot, allStocks, bookedGuard]
  );
  const snapshotCryptoRows = useMemo(
    () =>
      preview || !bookSnapshot
        ? null
        : rowsFromSnapshot(openSnapshotPositions(bookSnapshot, "crypto"), allStocks, "crypto", bookedGuard?.trade ?? null),
    [preview, bookSnapshot, allStocks, bookedGuard]
  );
  const tableHoldings = snapshotShareRows ?? tableSummary.holdings;

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
    const val = (h: HoldingMetrics): number | string => {
      switch (key) {
        case "ticker":
          return h.ticker.toLowerCase();
        case "company":
          return holdingTitle(h).toLowerCase();
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
    return [...tableHoldings].sort((a, b) => {
      const av = val(a);
      const bv = val(b);
      if (typeof av === "string" && typeof bv === "string") return av.localeCompare(bv) * mult;
      return ((av as number) - (bv as number)) * mult;
    });
  }, [tableHoldings, holdingSort]);

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
  const stockHoldings = stockOnly;
  const cryptoHoldings = cryptoMarked;
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
  const metalsAllocationSummary = useMemo(() => {
    const rows: Stock[] = [...metalStocks, ...preciousAsStocks].map((row) => {
      const key = inferMetalKey({
        ticker: row.ticker,
        assetType: row.asset_type,
        companyName: row.company_name,
        sector: row.sector,
      });
      return {
        ...row,
        asset_type: "metal" as const,
        sector: key === "silver" ? "Silver" : "Gold",
      };
    });
    return computeSummary(rows, { baseCurrency: "NZD", fxToNZD });
  }, [metalStocks, preciousAsStocks, fxToNZD]);
  const metalAlertHoldings = useMemo(
    () => [...metalStocks, ...preciousAsStocks],
    [metalStocks, preciousAsStocks]
  );
  // Live market value of everything held (excludes idle cash) + full net worth.
  // `metalsValueNZD` = the precious_metal bonus store; `metalStockTotalNZD` =
  // metals traded through the ledger — distinct records, so no double-count.
  const holdingsValueNZD = sumRoundedMoney([stockTotalNZD, cryptoTotalNZD, metalsValueNZD, metalStockTotalNZD]);
  const netWorthNZD = sumRoundedMoney([holdingsValueNZD, cashBalance]);
  // One shared portfolio-ready gate: KPI totals AND stock/crypto/metals position
  // cards only paint real data together (or all skeletons). Never show a non-zero
  // net-worth snapshot alongside empty position cards from an incomplete load.
  // Signed-in totals come from one portfolio snapshot. A missing price stays blank.
  const balancesReady = preview || (cashLoaded && metalsLoaded && !loading && snapshotReady);
  const usingSnapshot = !preview && balancesReady;
  const shareFigure = snapshotGroup(bookSnapshot, "shares");
  const cryptoFigure = snapshotGroup(bookSnapshot, "crypto");
  const metalsFigure = snapshotGroup(bookSnapshot, "metals");
  const storedReason = "This figure was not stored.";
  const showCash = !balancesReady ? null : usingSnapshot ? (bookSnapshot?.kpis.cash.value ?? null) : cashBalance;
  const showHoldings = !balancesReady ? null : usingSnapshot ? (bookSnapshot?.kpis.holdingsValue.value ?? null) : holdingsValueNZD;
  const showMetalsTotal = !balancesReady ? null : usingSnapshot ? (metalsFigure?.value ?? null) : metalsValueNZD + metalStockTotalNZD;
  const showNetWorth = !balancesReady ? null : usingSnapshot ? (bookSnapshot?.kpis.netWorth.value ?? null) : netWorthNZD;
  const showStock = !balancesReady ? null : usingSnapshot ? (shareFigure?.value ?? null) : stockTotalNZD;
  const showCrypto = !balancesReady ? null : usingSnapshot ? (cryptoFigure?.value ?? null) : cryptoTotalNZD;
  if (!headerFrozen) {
    liveHeaderRef.current = {
      holdings: showHoldings,
      net: showNetWorth,
      stock: showStock,
      crypto: showCrypto,
      metals: showMetalsTotal,
      cash: showCash,
    };
  }
  const paintedHeader = headerFrozen ? headerPaint.current : null;
  const headerHoldings = paintedHeader ? paintedHeader.holdings : showHoldings;
  const headerNet = paintedHeader ? paintedHeader.net : showNetWorth;
  const headerCash = paintedHeader ? paintedHeader.cash : showCash;
  useEffect(() => {
    if (preview || !userId || !balancesReady || !ledgerLoaded) return;
    writeCachedBook(userId, {
      stocks: allStocks,
      cash: cashBalance,
      metals: metalsValueNZD,
      incomeNzd,
      costFx,
      qtyFx,
      realisedFxNzd,
      at: new Date().toISOString(),
    });
  }, [preview, userId, balancesReady, ledgerLoaded, allStocks, cashBalance, metalsValueNZD, incomeNzd, costFx, qtyFx, realisedFxNzd]);
  const headerStock = paintedHeader ? paintedHeader.stock : showStock;
  const headerCrypto = paintedHeader ? paintedHeader.crypto : showCrypto;
  const headerMetals = paintedHeader ? paintedHeader.metals : showMetalsTotal;
  const cashReason =
    usingSnapshot && headerCash == null ? bookSnapshot?.kpis.cash.reason || snapshotError || storedReason : null;
  const stockReason = usingSnapshot && headerStock == null ? shareFigure?.reason || snapshotError || storedReason : null;
  const cryptoReason = usingSnapshot && headerCrypto == null ? cryptoFigure?.reason || snapshotError || storedReason : null;
  const metalsReason = usingSnapshot && headerMetals == null ? metalsFigure?.reason || snapshotError || storedReason : null;
  const holdingsReason =
    usingSnapshot && headerHoldings == null ? bookSnapshot?.kpis.holdingsValue.reason || snapshotError || storedReason : null;
  const netReason =
    usingSnapshot && headerNet == null ? bookSnapshot?.kpis.netWorth.reason || snapshotError || storedReason : null;
  const localSplit = useMemo(
    () =>
      computeHoldingSplit({
        holdings: [...stockHoldings, ...cryptoHoldings, ...metalStocks],
        incomeNzd,
        rates: fxToNZD,
        costFx,
        qtyFx,
        realisedFxNzd,
      }),
    [stockHoldings, cryptoHoldings, metalStocks, incomeNzd, fxToNZD, costFx, qtyFx, realisedFxNzd]
  );
  const snapshotSplit = !preview && bookSnapshot ? snapshotAsReturnSplit(bookSnapshot) : null;
  const returnSplit = snapshotSplit ?? localSplit;
  const splitBlank =
    !preview && balancesReady && !snapshotSplit
      ? bookSnapshot?.kpis.totalReturn.reason || snapshotError || "The portfolio snapshot did not load."
      : null;
  const reconciledLabel = !preview ? bookSnapshot?.reconciliation.label ?? null : null;
  const ownedText = (figure: SnapshotFigure | null, fallback: number) => {
    if (!balancesReady) return { text: "", title: null as string | null };
    if (usingSnapshot) {
      if (!figure || figure.value == null) {
        return { text: "—", title: figure?.reason || snapshotError || storedReason };
      }
      return { text: figure.display, title: null as string | null };
    }
    return { text: formatMoney(fallback, "NZD"), title: null as string | null };
  };
  const stockOwned = ownedText(shareFigure, stockTotalNZD);
  const cryptoOwned = ownedText(cryptoFigure, cryptoTotalNZD);
  const metalsOwned = ownedText(metalsFigure, metalsValueNZD + metalStockTotalNZD);
  const stockWorth = ownedText(shareFigure, stockOverviewSummary.totalValue);
  const snapshotShareOpen = openSnapshotPositions(bookSnapshot, "shares");
  const snapshotCryptoOpen = openSnapshotPositions(bookSnapshot, "crypto");
  const summedFigure = (positions: SnapshotPosition[], pick: (position: SnapshotPosition) => SnapshotFigure) => {
    if (positions.some((position) => pick(position).value == null)) {
      return {
        text: "—",
        title: positions.map((position) => pick(position)).find((figure) => figure.value == null)?.reason || storedReason,
        value: null as number | null,
      };
    }
    const value = roundMoney(positions.reduce((total, position) => total + (pick(position).value || 0), 0));
    return { text: formatNzd(value), title: null as string | null, value };
  };
  const stockPnl = usingSnapshot
    ? summedFigure(snapshotShareOpen, (position) => position.unrealised)
    : { text: formatMoney(stockOverviewSummary.totalGain, "NZD"), title: null as string | null, value: stockOverviewSummary.totalGain };
  const stockCost = usingSnapshot
    ? summedFigure(snapshotShareOpen, (position) => position.costBase)
    : { text: formatMoney(stockOverviewSummary.totalCost, "NZD"), title: null as string | null, value: stockOverviewSummary.totalCost };
  const stockCostText = stockCost.text;
  const stockGainPct =
    stockPnl.value != null && stockCost.value
      ? (stockPnl.value / stockCost.value) * 100
      : usingSnapshot
        ? null
        : stockOverviewSummary.totalGainPct;
  const cryptoNative = snapshotCryptoOpen.some((position) => position.marketPriceLocal == null)
    ? null
    : snapshotCryptoOpen.reduce((total, position) => total + position.quantity * (position.marketPriceLocal || 0), 0);
  const cryptoWorth =
    usingSnapshot && cryptoBookCurrency === "NZD"
      ? ownedText(cryptoFigure, cryptoOverviewSummary.totalValue)
      : usingSnapshot
        ? {
            text: cryptoNative == null ? "—" : formatMoney(cryptoNative, cryptoBookCurrency),
            title: cryptoNative == null ? cryptoFigure?.reason || storedReason : null,
          }
        : { text: formatMoney(cryptoOverviewSummary.totalValue, cryptoBookCurrency), title: null as string | null };
  const cryptoNativeGain = snapshotCryptoOpen.some((position) => position.marketPriceLocal == null || position.averageCostLocal == null)
    ? null
    : snapshotCryptoOpen.reduce(
        (total, position) => total + position.quantity * ((position.marketPriceLocal || 0) - (position.averageCostLocal || 0)),
        0
      );
  const cryptoPnl = usingSnapshot
    ? cryptoBookCurrency === "NZD"
      ? summedFigure(snapshotCryptoOpen, (position) => position.unrealised)
      : {
          text: cryptoNativeGain == null ? "—" : formatMoney(cryptoNativeGain, cryptoBookCurrency),
          title: cryptoNativeGain == null ? cryptoFigure?.reason || storedReason : null,
          value: cryptoNativeGain,
        }
    : { text: formatMoney(cryptoOverviewSummary.totalGain, cryptoBookCurrency), title: null as string | null, value: cryptoOverviewSummary.totalGain };
  const cryptoCostNzd = summedFigure(snapshotCryptoOpen, (position) => position.costBase);
  const cryptoNativeCost = snapshotCryptoOpen.some((position) => position.averageCostLocal == null)
    ? null
    : snapshotCryptoOpen.reduce((total, position) => total + position.quantity * (position.averageCostLocal || 0), 0);
  const cryptoCostText = usingSnapshot
    ? cryptoBookCurrency === "NZD"
      ? cryptoCostNzd.text
      : cryptoNativeCost == null
        ? "—"
        : formatMoney(cryptoNativeCost, cryptoBookCurrency)
    : formatMoney(cryptoOverviewSummary.totalCost, cryptoBookCurrency);
  const cryptoGainPct = !usingSnapshot
    ? cryptoOverviewSummary.totalGainPct
    : cryptoBookCurrency === "NZD"
      ? cryptoPnl.value != null && cryptoCostNzd.value
        ? (cryptoPnl.value / cryptoCostNzd.value) * 100
        : null
      : cryptoNativeGain != null && cryptoNativeCost
        ? (cryptoNativeGain / cryptoNativeCost) * 100
        : null;
  const kpiPending = !balancesReady;

  async function handleRefreshPrices() {
    setRefreshing(true);
    console.log("[dashboard] Refreshing market prices…");
    const tracked = trackAccountRequest();
    const res = await api.post<Stock[]>("/api/stocks/refresh", {}, { signal: tracked.signal });
    tracked.release();
    if (
      res.aborted ||
      !acceptAccountPayload({
        epoch: tracked.epoch,
        requestUserId: tracked.userId,
        responseUserId: responseUserId(res),
        rows: res.data,
      })
    ) {
      console.error("[dashboard] Discarding manual refresh for other/stale user");
      setRefreshing(false);
      return;
    }
    if (res.ok && res.data) {
      // The refresh endpoint returns all holdings; the active bot's are derived.
      setAllStocks(res.data);
      clearPortfolioSnapshotCache(userId);
      void loadPortfolioSnapshot({ force: true });
      toast.success("Prices updated");
    } else {
      console.error("[dashboard] Refresh failed:", res.error);
      toast.error("Could not refresh prices.");
    }
    setRefreshing(false);
  }

  function tradeCashInput(): { cash: number; cashKnown: boolean } {
    const fromBook = bookSnapshot?.kpis.cash.value;
    return {
      cash: typeof fromBook === "number" ? fromBook : cashBalance,
      cashKnown: cashLoaded || typeof fromBook === "number",
    };
  }

  function handleCalculatorTrade(input: {
    ticker: string;
    name: string;
    assetClass: SnapshotClass;
    action: "buy" | "sell" | "edit" | "delete" | "dividend";
    target: { via: "stock"; stockId: string } | { via: "metal-store"; metalId: string };
  }) {
    if (input.target.via === "metal-store") {
      const metalId = input.target.metalId;
      const metal = preciousMetalHoldings.find((row) => row._id === metalId);
      if (!metal) {
        toast.error("This row is not on the holdings list.");
        return;
      }
      const live = metalsSpotLive
        ? metalSpot?.[metal.metal]?.nzdPerOz || publicSpot?.[metal.metal]?.nzdPerOz
        : 0;
      if (input.action !== "buy" && input.action !== "sell") {
        toast.error("This metal desk row uses Buy and Sell. Edit and delete are on a ledger holding.");
        return;
      }
      openRecordTransaction({
        mode: input.action,
        userId,
        holdings: transactionHoldings,
        ...tradeCashInput(),
        preferredAssetType: "metal",
        seed: {
          ticker: metal.metal === "silver" ? "SILVER" : "GOLD",
          name: metal.metal === "silver" ? "Silver bullion" : "Gold bullion",
          assetType: "metal",
          ...(live && live > 0 ? { price: live } : {}),
          ...(input.action === "sell" ? { metalSourceId: metal._id } : {}),
        },
      });
      return;
    }
    const stockId = input.target.stockId;
    const stock = allStocks.find((row) => row._id === stockId);
    if (!stock) {
      toast.error("This row is not on the holdings list.");
      return;
    }
    if (input.action === "buy" || input.action === "sell") recordHolding(stock, input.action);
    else if (input.action === "dividend") {
      openRecordTransaction({
        mode: "dividend",
        userId,
        holdings: allStocks,
        ...tradeCashInput(),
        seed: {
          ticker: stock.ticker,
          name: stock.company_name || stock.ticker,
          assetType: stock.asset_type === "crypto" ? "crypto" : stock.asset_type === "metal" ? "metal" : "stock",
        },
      });
    } else if (input.action === "edit") openEdit(stock);
    else setDeleteTarget(stock);
  }

  function handleReport(_row: HoldingsRowModel, kind: "stox" | "koins") {
    document.getElementById("report-center")?.scrollIntoView({ behavior: "smooth" });
    const control = kind === "koins" ? reportDesk?.koins : reportDesk?.stox;
    if (!reportDesk?.loaded || !control) {
      toast.error(QUOTA_NOT_LOADED);
      return;
    }
    if (control.disabled) {
      toast.error(control.title);
      return;
    }
    reportDesk.run(kind === "koins" ? "crypto" : "stock");
  }

  function handleAlert(row: HoldingsRowModel) {
    const asset = row.assetClass === "crypto" ? "crypto" : "stock";
    setAlertSeed({ ticker: row.ticker, nonce: Date.now(), asset });
    document.getElementById("dashboard-alerts")?.scrollIntoView({ behavior: "smooth" });
  }

  function handleWatch(row: HoldingsRowModel) {
    const asset = row.assetClass === "crypto" ? "crypto" : "stock";
    setWatchClass(asset);
    setWatchSeed({ ticker: row.ticker, nonce: Date.now(), asset });
    document.getElementById("dashboard-watchlist")?.scrollIntoView({ behavior: "smooth" });
  }

  async function handleDeleteDividend(line: SnapshotLedgerLine): Promise<boolean> {
    const res = await api.delete<{ cash?: { after?: number }; alreadyRemoved?: boolean }>(
      `/api/transactions?id=${encodeURIComponent(line.id)}`
    );
    const label = line.type === "dividend" ? "Dividend" : line.type === "buy" ? "Buy" : "Sell";
    if (res.ok) {
      // b7 H-5: an id that is already gone is a success (idempotent), not "not found".
      toast.success(res.data?.alreadyRemoved ? `${label} was already removed` : `${label} removed`);
      const after = res.data?.cash?.after;
      handleDataChanged(typeof after === "number" ? { cashBalance: after } : undefined);
      return true;
    }
    toast.error(typeof res.error === "string" ? res.error : `That ${label.toLowerCase()} was not removed.`);
    return false;
  }

  async function handleEditTrade(line: SnapshotLedgerLine, fields: TradeEditFields): Promise<boolean> {
    const res = await api.patch(`/api/transactions`, { id: line.id, ...fields, confirm: true });
    if (res.ok) {
      toast.success("Trade updated");
      handleDataChanged();
      return true;
    }
    toast.error(typeof res.error === "string" ? res.error : "That trade was not changed.");
    return false;
  }

  function handleEditLedger(line: SnapshotLedgerLine) {
    const ticker = line.ticker.trim().toUpperCase();
    const matches = ticker ? allStocks.filter((row) => row.ticker.toUpperCase() === ticker) : [];
    if (matches.length !== 1) {
      toast.error(
        matches.length > 1
          ? "More than one holding uses this ticker. Open the holding and use Edit there."
          : "This ledger line has no holding to edit."
      );
      return;
    }
    openEdit(matches[0]);
  }

  async function exportLedger() {
    const res = await fetch("/api/transactions/export", { credentials: "include" });
    if (res.status === 402 || res.status === 403) {
      toast.error("CSV export is included on Starter and above.");
      return;
    }
    if (!res.ok) {
      toast.error("Could not export transactions.");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "transactions.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function handleCalculatorCash(mode: "deposit" | "withdraw") {
    openRecordTransaction({
      mode,
      userId,
      holdings: allStocks,
      ...tradeCashInput(),
    });
  }

  function openAdd() {
    // Gate on the plan's ticker quota before opening the add dialog.
    if (atLimit) {
      const founder = quota.upgradeHref.startsWith("mailto:");
      toast.error(quota.message, {
        action: {
          label: founder ? "Talk to us" : "See Pro",
          onClick: () => { window.location.href = quota.upgradeHref; },
        },
      });
      return;
    }
    openRecordTransaction({
      mode: "buy",
      userId,
      holdings: allStocks,
      ...tradeCashInput(),
      preferredAssetType: isCrypto ? "crypto" : isMetals ? "metal" : isStocks ? "stock" : null,
    });
  }

  function openEdit(stock: Stock) {
    const assetType = stock.asset_type === "crypto" ? "crypto" : stock.asset_type === "metal" ? "metal" : "stock";
    openRecordTransaction({
      mode: "correction",
      userId,
      holdings: allStocks,
      ...tradeCashInput(),
      seed: {
        ticker: stock.ticker,
        name: stock.company_name || stock.ticker,
        assetType,
        price: stock.purchase_price,
        quantity: stock.shares,
        purchaseDate: stock.purchase_date,
        holdingId: stock._id,
        market: dexFromHolding(stock).venue === "DEX" ? "DEX" : stock.asset_type === "crypto" ? "Crypto" : undefined,
        chain: dexFromHolding(stock).chain,
      },
    });
  }

  function recordHolding(
    holding: {
      ticker: string;
      company_name?: string;
      asset_type?: string | null;
      current_price?: number;
      venue?: string | null;
      chain?: string | null;
      sector?: string | null;
    },
    mode: "buy" | "sell"
  ) {
    const assetType = holding.asset_type === "crypto" ? "crypto" : holding.asset_type === "metal" ? "metal" : "stock";
    const stored = dexFromHolding(holding);
    openRecordTransaction({
      mode,
      userId,
      holdings: allStocks,
      ...tradeCashInput(),
      seed: {
        ticker: holding.ticker,
        name: holding.company_name || holding.ticker,
        assetType,
        price: holding.current_price,
        market: stored.venue === "DEX" ? "DEX" : assetType === "crypto" ? "Crypto" : undefined,
        chain: stored.chain,
      },
    });
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
      setBookedGuard(bookedGuardAfterEvent(bookedGuardRef.current, { type: "delete" }));
      handleDataChanged();
    } else {
      console.error("[dashboard] Delete failed:", res.error);
      toast.error("Could not remove holding.");
    }
  }

  const gainTone = summary.totalGain >= 0 ? "up" : "down";

  const isHome = view === "home";
  const legacyHomeTotals = duplicateHomeFiguresVisible({
    isHome,
    preview,
    balancesReady,
    snapshotPresent: bookSnapshot != null,
  });
  const workspaceOn = isHome && !preview && !(balancesReady && !bookSnapshot);
  const isBots = view === "bots";
  const isCash = view === "cash";
  const isStocks = view === "stocks";
  const isCrypto = view === "crypto";
  const isMetals = view === "metals";
  const isTransactions = view === "transactions";
  const isAlerts = view === "alerts";
  const allocationSummary = isMetals ? metalsAllocationSummary : summary;
  const allocationLabel = hubAllocationLabel(view, bot);
  const allocationCurrency = isMetals ? "NZD" : baseCurrency;
  const isMarket =
    view === "nzsx" || view === "asx" || view === "nasdaq" || view === "dow";
  const marketExchange =
    view === "nzsx"
      ? ("NZX" as const)
      : view === "asx"
        ? ("ASX" as const)
        : view === "nasdaq"
          ? ("NASDAQ" as const)
          : view === "dow"
            ? ("DOW" as const)
            : null;
  const marketTitle =
    view === "nzsx"
      ? "NZX 50"
      : view === "asx"
        ? "ASX"
        : view === "nasdaq"
          ? "NASDAQ"
          : view === "dow"
            ? "Dow Jones"
            : "";
  const pageTitle =
    view === "bots"
      ? "Run AI Bots"
      : view === "cash"
      ? "Cash Balance"
      : view === "stocks"
        ? "Stock Portfolio Overview"
        : view === "crypto"
          ? "Crypto Portfolio Overview"
          : view === "metals"
            ? "Precious Metals Overview"
            : view === "transactions"
              ? "Transaction Ledger"
              : view === "alerts"
                ? "Price Alerts"
                : isMarket
                ? marketTitle
                : "Dashboard";

  return (
    <MarketIntelProvider bot={bot}>
    <div className="mx-auto w-full min-w-0 max-w-6xl overflow-x-clip px-4 py-8 sm:px-6 lg:px-8" aria-busy={kpiPending || undefined}>
      {/* Header — matches dashboard home mock */}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">
            {preview
              ? "Live preview"
              : userName.trim()
                ? `Welcome, ${userName.trim()}`
                : "Welcome"}
          </p>
          {!isHome ? (
            <Link
              href="/dashboard"
              className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
            >
              <ArrowLeft className="size-4" /> Back to Dashboard
            </Link>
          ) : null}
          {isHome ? null : (
          <h1 className="mt-2 font-grift-black text-2xl uppercase tracking-wide text-amber-400 sm:text-3xl lg:text-4xl">
            {pageTitle}
          </h1>
          )}
          {isHome && !preview ? (
            <Link href="/tax" className="mt-2 inline-flex text-sm font-semibold text-primary hover:underline">
              Tax papers
            </Link>
          ) : null}
        </div>
        {preview ? (
          <Button asChild className="font-semibold shadow-glow">
            <Link href="/register">
              <Sparkles className="mr-2 size-4" /> Create free account
            </Link>
          </Button>
        ) : (
        <div className="flex w-full min-w-0 flex-col items-stretch gap-3 sm:w-auto sm:items-end">
          <div className="flex w-full min-w-0 flex-wrap items-center justify-end gap-2">
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
          <div className="flex flex-wrap items-end justify-end gap-6">
            <div className="text-right">
              <p className="text-[0.68rem] font-semibold uppercase tracking-wide text-foreground">
                Total net worth
              </p>
              <BookMoney
                snap
                value={headerNet}
                reason={netReason}
                loading={!balancesReady}
                skeletonClassName="mt-1 ml-auto h-7 w-28 animate-pulse rounded-md bg-muted/50"
                className="tnum font-display text-xl font-bold text-emerald-700 sm:text-2xl"
              />
            </div>
          </div>
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

      {isHome && !preview ? (
        <DashboardCalculator
          snapshot={bookSnapshot}
          loading={!balancesReady}
          error={snapshotError}
          userId={userId ?? null}
          onTrade={handleCalculatorTrade}
          onCash={handleCalculatorCash}
          onRecord={openAdd}
          onEditLedger={handleEditLedger}
          onDeleteDividend={handleDeleteDividend}
          onEditTrade={handleEditTrade}
          onReport={handleReport}
          onAlert={handleAlert}
          onWatch={handleWatch}
          reportRuns={{
            stox: reportDesk?.stox ?? unloadedReportControl("Stox"),
            koins: reportDesk?.koins ?? unloadedReportControl("Koins"),
          }}
          onRetry={() => {
            void loadPortfolioSnapshot({ force: true });
          }}
          emptyActions={
            <Button type="button" size="sm" onClick={openAdd}>Add your first holding</Button>
          }
          actions={
            <div className="mt-4 flex w-full min-w-0 max-w-full flex-wrap items-center gap-2" data-header-actions>
              <details className="w-full md:hidden">
                <summary className="inline-flex min-h-11 cursor-pointer list-none items-center rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground">
                  + Add
                </summary>
                <div className="mt-2 flex flex-col items-stretch gap-2">
                  <Button type="button" className="h-auto min-h-11 whitespace-normal" onClick={openAdd}>+ Add trade</Button>
                  <HoldingsCsvImport assetType="stock" onImported={handleDataChanged} />
                  <Button type="button" variant="outline" className="h-auto min-h-11 whitespace-normal" onClick={() => handleCalculatorCash("deposit")}>Deposit/Withdraw</Button>
                  <a href="/dashboard/split" className="inline-flex min-h-11 items-center justify-center rounded-md border px-4 text-sm font-medium">Record split</a>
                  <Button type="button" variant="outline" className="h-auto min-h-11 whitespace-normal" onClick={() => void exportLedger()} disabled={freePlan} aria-label={freePlan ? csvLockAccessibleName("Transactions CSV") : undefined} title={freePlan ? CSV_LOCK_LABEL : undefined}>{freePlan ? CSV_LOCK_LABEL : "Export"}</Button>
                  <Button type="button" variant="outline" className="h-auto min-h-11 whitespace-normal" disabled={(reportDesk?.stox ?? unloadedReportControl("Stox")).disabled} title={(reportDesk?.stox ?? unloadedReportControl("Stox")).title} onClick={() => handleReport({ ticker: "", name: "Portfolio", assetClass: "shares", kind: "position" } as HoldingsRowModel, "stox")}>{(reportDesk?.stox ?? unloadedReportControl("Stox")).label}</Button>
                  <Button type="button" variant="outline" className="h-auto min-h-11 whitespace-normal" disabled={(reportDesk?.koins ?? unloadedReportControl("Koins")).disabled} title={(reportDesk?.koins ?? unloadedReportControl("Koins")).title} onClick={() => handleReport({ ticker: "", name: "Portfolio", assetClass: "crypto", kind: "position" } as HoldingsRowModel, "koins")}>{(reportDesk?.koins ?? unloadedReportControl("Koins")).label}</Button>
                </div>
              </details>
              <div className="hidden w-full min-w-0 flex-wrap items-center gap-2 md:flex">
              <Button type="button" className="h-auto min-h-11 max-w-full whitespace-normal" onClick={openAdd}>+ Add trade</Button>
              <HoldingsCsvImport assetType="stock" onImported={handleDataChanged} />
              <Button type="button" variant="outline" className="h-auto min-h-11 max-w-full whitespace-normal" onClick={() => handleCalculatorCash("deposit")}>Deposit/Withdraw</Button>
              <a href="/dashboard/split" className="inline-flex min-h-11 items-center justify-center rounded-md border px-4 text-sm font-medium">Record split</a>
              <Button type="button" variant="outline" className="h-auto min-h-11 max-w-full whitespace-normal" onClick={() => void exportLedger()} disabled={freePlan} aria-label={freePlan ? csvLockAccessibleName("Transactions CSV") : undefined} title={freePlan ? CSV_LOCK_LABEL : undefined}>
                {freePlan ? CSV_LOCK_LABEL : "Export"}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-auto min-h-11 max-w-full whitespace-normal"
                disabled={(reportDesk?.stox ?? unloadedReportControl("Stox")).disabled}
                title={(reportDesk?.stox ?? unloadedReportControl("Stox")).title}
                onClick={() => handleReport({ ticker: "", name: "Portfolio", assetClass: "shares", kind: "position" } as HoldingsRowModel, "stox")}
              >
                {(reportDesk?.stox ?? unloadedReportControl("Stox")).label}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-auto min-h-11 max-w-full whitespace-normal"
                disabled={(reportDesk?.koins ?? unloadedReportControl("Koins")).disabled}
                title={(reportDesk?.koins ?? unloadedReportControl("Koins")).title}
                onClick={() => handleReport({ ticker: "", name: "Portfolio", assetClass: "crypto", kind: "position" } as HoldingsRowModel, "koins")}
              >
                {(reportDesk?.koins ?? unloadedReportControl("Koins")).label}
              </Button>
              </div>
            </div>
          }
          cryptoEmpty={
            <span className="inline-flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" variant="outline" onClick={openAdd}>+ Add holding</Button>
              <HoldingsCsvImport assetType="crypto" onImported={handleDataChanged} />
            </span>
          }
          insights={
            <DashboardInsights
              stocks={allStocks}
              holdingsCount={summary.holdingsCount}
              freePlan={freePlan}
              onBought={handleDataChanged}
            />
          }
          rail={
            <DashboardRail
              freePlan={freePlan}
              loading={loading}
              preview={preview}
              bookSnapshot={bookSnapshot}
              stockOnly={stockOnly}
              cryptoMarked={cryptoMarked}
              alertClass={alertClass}
              onAlertClass={setAlertClass}
              alertSeed={alertSeed}
              watchClass={watchClass}
              onWatchClass={setWatchClass}
              watchReload={watchlistSignal + (watchSeed?.nonce || 0)}
              watchSeed={watchSeed}
              // b6 H-7: plan usage counts every open holding in the book (shares, crypto and metals), not the active tab.
              holdingsCount={holdingCounts.total}
              tickerLimit={tickerLimit}
              reportQuota={railQuota}
            />
          }
          reports={
            <ReportCenter
              onFreeQuota={setRailQuota}
              botAccess={subscription.botAccess}
              plan={subscription.plan}
              scope={scope}
              counts={holdingCounts}
              countsReady={preview || !loading}
              tickerLimit={tickerLimit}
              userId={userId}
              holdings={allStocks}
              onHoldingsChanged={handleDataChanged}
              preview={preview}
              onDesk={onReportDesk}
              seed={deskSeed}
            />
          }
          actionFor={(row) =>
            resolveHoldingAction({
              ticker: row.ticker,
              assetClass: row.assetClass,
              holdingId: row.holdingId,
              stocks: allStocks,
              metalStore: preciousMetalHoldings,
            })
          }
        />
      ) : null}

      {isHome && !workspaceOn && (
      <>
      <DashboardHomeGrid
        cashBalance={headerCash}
        stockTotalNZD={headerStock}
        cryptoTotalNZD={headerCrypto}
        metalsTotalNZD={headerMetals}
        stockPositions={stockHoldings.filter((row) => (Number(row.shares) || 0) > 1e-9).length}
        cryptoPositions={cryptoHoldings.length}
        metalsPositions={preciousMetalHoldings.length + metalStocks.length}
        recentLedger={recentLedger}
        balancesLoading={!balancesReady}
        ledgerLoading={!preview && !ledgerLoaded}
        ledgerCash={
          preview
            ? cashBalance
            : (bookSnapshot?.kpis.cash.value ?? (cashLoaded ? cashBalance : null))
        }
        metalsSpotLive={metalsSpotLive}
        metalsQuotedAt={publicSpot?.quotedAt ?? null}
        cashReason={cashReason}
        stockReason={stockReason}
        cryptoReason={cryptoReason}
        metalsReason={metalsReason}
        cashNote={bookSnapshot?.cashWarning}
        hideValueCards={!legacyHomeTotals}
      />
      {legacyHomeTotals ? (
      <ReturnsSplitCard
        holdings={[...stockHoldings, ...cryptoHoldings, ...metalStocks]}
        incomeNzd={incomeNzd}
        rates={fxToNZD}
        split={returnSplit}
        loading={!balancesReady || !ledgerLoaded}
        scopeLabel="Whole book"
        reconciledLabel={reconciledLabel}
        blankReason={splitBlank}
      />
      ) : null}
      </>
      )}

      {workspaceOn && balancesReady && allStocks.length === 0 && preciousMetalHoldings.length === 0 ? (
        <div className="mt-4">
          <OnboardingChecklist
            hasCash={cashBalance > 0}
            hasHoldings={false}
            hasBuy={(bookSnapshot?.ledger ?? []).some((line) => line.type === "buy")}
            plan={subscription.plan}
            deferProbe
            hasAlerts={onboardingProbe.alerts ?? undefined}
            hasReport={onboardingProbe.report ?? undefined}
            probeError={onboardingProbe.error}
            onProbeRetry={() => setProbeNonce((n) => n + 1)}
          />
        </div>
      ) : null}

      {isHome && !preview && balancesReady && !workspaceOn && (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <OnboardingChecklist
            hasCash={cashBalance > 0}
            hasHoldings={allStocks.length > 0 || preciousMetalHoldings.length > 0}
            hasBuy={(bookSnapshot?.ledger ?? []).some((line) => line.type === "buy")}
            plan={subscription.plan}
            deferProbe
            hasAlerts={onboardingProbe.alerts ?? undefined}
            hasReport={onboardingProbe.report ?? undefined}
            probeError={onboardingProbe.error}
            onProbeRetry={() => setProbeNonce((n) => n + 1)}
          />
          {freePlan ? (
            <p className="rounded-2xl border border-border/70 bg-card/40 p-4 text-sm text-muted-foreground">
              Allocation drift is on a paid plan.{" "}
              <a href="/pricing" className="font-medium text-primary hover:underline">See plans</a>
            </p>
          ) : headerStock != null && headerCrypto != null && headerMetals != null && headerCash != null ? (
          <AllocationDriftCard
            stockNZD={headerStock}
            cryptoNZD={headerCrypto}
            metalsNZD={headerMetals}
            cashNZD={headerCash}
          />
          ) : (
          <p
            className="rounded-2xl border border-border/70 bg-card/40 p-4 text-sm text-muted-foreground"
            title={stockReason || cryptoReason || metalsReason || cashReason || storedReason}
          >
            —
            <span className="mt-1 block text-xs">{stockReason || cryptoReason || metalsReason || cashReason || storedReason}</span>
          </p>
          )}
        </div>
      )}

      {/* Report Center under home window tiles / bots desk (not on stocks/crypto hubs) */}
      {((isHome && !workspaceOn) || isBots) && (
      <div id="dash-report-centre" className="mt-8 scroll-mt-24">
      <DashboardGate
        preview={preview}
        title="Report Centre"
        description="Generate full PDF portfolio reports with market intelligence, indicators and AI insight. Email is sent only when delivery succeeds."
      >
        <ReportCenter
          botAccess={subscription.botAccess}
          plan={subscription.plan}
          scope={scope}
          counts={holdingCounts}
          countsReady={preview || !loading}
          tickerLimit={tickerLimit}
          userId={userId}
          holdings={allStocks}
          onHoldingsChanged={handleDataChanged}
          preview={preview}
          seed={deskSeed}
        />
      </DashboardGate>
      </div>
      )}

      {(isTransactions || isCash) && (
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-primary/40 bg-gradient-to-br from-primary/15 via-card/70 to-card/50 p-4">
            <p className="font-grift-black text-sm uppercase tracking-wide text-amber-400">Cash Bal</p>
            <BookMoney
              snap
              value={headerCash}
              reason={cashReason}
              loading={!balancesReady}
              skeletonClassName="mt-2 h-7 w-28 animate-pulse rounded-md bg-muted/50"
              className="tnum mt-2 font-display text-xl font-bold text-emerald-700"
            />
            <p className="mt-1 text-[0.7rem] text-muted-foreground">From Transaction Ledger</p>
            {bookSnapshot?.cashWarning ? (
              <p className="mt-1 text-[0.7rem] text-muted-foreground">{bookSnapshot.cashWarning}</p>
            ) : null}
          </div>
          <div className="rounded-2xl border border-border/70 bg-card/70 p-4">
            <p className="font-grift-black text-sm uppercase tracking-wide text-amber-400">Value in Stocks NZD</p>
            <BookMoney
              value={headerStock}
              reason={stockReason}
              loading={!balancesReady}
              skeletonClassName="mt-2 h-7 w-28 animate-pulse rounded-md bg-muted/50"
              className="tnum mt-2 font-display text-xl font-bold text-emerald-700"
            />
            <p className="mt-1 text-[0.7rem] text-muted-foreground">Live holdings from stock buys</p>
          </div>
          <div className="rounded-2xl border border-border/70 bg-card/70 p-4">
            <p className="font-grift-black text-sm uppercase tracking-wide text-amber-400">Value in Crypto NZD</p>
            <BookMoney
              value={headerCrypto}
              reason={cryptoReason}
              loading={!balancesReady}
              skeletonClassName="mt-2 h-7 w-28 animate-pulse rounded-md bg-muted/50"
              className="tnum mt-2 font-display text-xl font-bold text-emerald-700"
            />
            <p className="mt-1 text-[0.7rem] text-muted-foreground">Live holdings from crypto buys</p>
          </div>
          <div className="rounded-2xl border border-border/70 bg-card/70 p-4">
            <p className="font-grift-black text-sm uppercase tracking-wide text-amber-400">Value in Metals NZD</p>
            <BookMoney
              value={headerMetals}
              reason={metalsReason}
              loading={!balancesReady}
              skeletonClassName="mt-2 h-7 w-28 animate-pulse rounded-md bg-muted/50"
              className="tnum mt-2 font-display text-xl font-bold text-emerald-700"
            />
            <p className="mt-1 text-[0.7rem] text-muted-foreground">
              {metalsSpotLive ? "Spot" : "Est."} holdings from metals trades
            </p>
          </div>
        </div>
      )}

      {isCash ? (
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-primary/40 bg-gradient-to-br from-primary/15 via-card/70 to-card/50 p-6">
            <p className="font-grift-black text-sm uppercase tracking-wide text-amber-400">Cash Bal</p>
            <BookMoney
              snap
              value={headerCash}
              reason={cashReason}
              loading={!balancesReady}
              skeletonClassName="mt-3 h-9 w-36 animate-pulse rounded-md bg-muted/50"
              className="tnum mt-3 font-display text-3xl font-bold text-emerald-700"
            />
            <p className="mt-2 text-sm text-muted-foreground">Available for buys across stocks, crypto and metals.</p>
            {bookSnapshot?.cashWarning ? (
              <p className="mt-1 text-sm text-muted-foreground">{bookSnapshot.cashWarning}</p>
            ) : null}
          </div>
          <div className="rounded-2xl border border-border/70 bg-card/70 p-6">
            <p className="font-grift-black text-sm uppercase tracking-wide text-amber-400">Net worth</p>
            <BookMoney
              snap
              value={headerNet}
              reason={netReason}
              loading={!balancesReady}
              skeletonClassName="mt-3 h-9 w-36 animate-pulse rounded-md bg-muted/50"
              className="tnum mt-3 font-display text-3xl font-bold text-emerald-700"
            />
            <p className="mt-2 text-sm text-muted-foreground">Cash plus live holdings value.</p>
          </div>
        </div>
      ) : null}

      {isMarket && marketExchange ? (
        <div className="mt-8 space-y-4">
          <IndexMarketCard title={marketTitle} exchange={marketExchange} className="min-h-[16rem]" />
          <div className="rounded-2xl border border-border/70 bg-card/60 p-4">
            <h2 className="font-grift-black text-lg uppercase tracking-wide text-amber-400">
              {marketTitle} market terminal
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Live index, breadth and movers for this exchange. Use ALL Markets for the full cross-exchange browser.
            </p>
            <div className="mt-4">
              <OpenMarketSnapshot onBought={handleDataChanged} />
            </div>
            <div className="mt-4">
              <AllMarkets onBought={handleDataChanged} />
            </div>
          </div>
        </div>
      ) : null}

      {/* ───────────────────────── 3 · Stock portfolio overview ───────────────────────── */}
      {isStocks ? (
      <div id="dash-stock-overview" className="mt-10 scroll-mt-24">
      <DashboardGate
        preview={preview}
        title="Stock Portfolio Overview"
        description="Your KPIs — total worth and P/L at the latest available price."
      >
        {/* Stocks hub return split and holdings table stay until PR5. */}
        <ReturnsSplitCard
          holdings={[...stockHoldings, ...cryptoHoldings, ...metalStocks]}
          incomeNzd={incomeNzd}
          rates={fxToNZD}
          split={returnSplit}
          loading={!balancesReady || !ledgerLoaded}
          scopeLabel="Whole book"
          reconciledLabel={reconciledLabel}
          blankReason={splitBlank}
        />

      {/* KPI cards — stocks */}
      <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total worth · NZD"
          value={stockWorth.text}
          title={stockWorth.title}
          sub={stockWorth.title || `Cost basis ${stockCostText}`}
          icon={Wallet}
          loading={!balancesReady}
        />
        <StatCard
          label={PL_AT_LATEST_PRICE}
          value={stockPnl.text}
          title={stockPnl.title}
          sub={stockPnl.title || `${stockGainPct == null ? "—" : formatPercent(stockGainPct)} · Stocks only, at today's rate. Excludes the currency effect in the split above.`}
          icon={stockPnl.value != null && stockPnl.value < 0 ? TrendingDown : TrendingUp}
          tone={stockPnl.value != null && stockPnl.value < 0 ? "down" : "up"}
          loading={!balancesReady}
        />
        {freePlan ? null : (
        <>
        <StatCard
          label="7-Day alpha potential"
          value={stockOverviewMetrics.alphaKnown ? `${stockOverviewMetrics.alphaPotentialPct >= 0 ? "+" : ""}${stockOverviewMetrics.alphaPotentialPct.toFixed(2)}%` : "Not enough history"}
          sub={
            !stockOverviewMetrics.alphaKnown
              ? "Not enough history"
              : stockOverviewSummary.holdingsCount
              ? `${formatMoney(stockOverviewMetrics.alphaPotentialValue, "NZD")} projected move`
              : "Add holdings to project"
          }
          icon={Zap}
          tone={stockOverviewMetrics.alphaPotentialPct >= 0 ? "up" : "down"}
          loading={!balancesReady}
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
          loading={!balancesReady}
        />
        </>
        )}
      </div>
      {freePlan ? (
        <p className="mt-4 rounded-2xl border border-border/70 bg-card/40 p-4 text-sm text-muted-foreground">
          7-day alpha, portfolio health and Sharpe are on a paid plan.{" "}
          <a href="/pricing" className="font-medium text-primary hover:underline">See plans</a>
        </p>
      ) : null}

      {!freePlan && stockOverviewSummary.holdingsCount > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-4 rounded-2xl border border-border/70 bg-card/40 p-4 sm:grid-cols-4">
          <MiniMetric icon={Activity} label="Ann. volatility" value={stockOverviewMetrics.enoughHistory ? `${stockOverviewMetrics.volatility.toFixed(1)}%` : "Not enough history"} />
          <MiniMetric icon={Gauge} label="Sharpe ratio" value={stockOverviewMetrics.enoughHistory ? stockOverviewMetrics.sharpe.toFixed(2) : "Not enough history"} />
          <MiniMetric icon={PieChart} label="Diversification" value={`${stockOverviewMetrics.diversification}%`} />
          <MiniMetric icon={Trophy} label="Win rate" value={stockOverviewMetrics.enoughHistory ? `${stockOverviewMetrics.winRate}%` : "Not enough history"} />
        </div>
      )}

      {/* Stocks hub return split and holdings table stay until PR5. */}
      <HoldingsOwnedTable
        title="Stocks you own"
        emptyLabel="No stocks in this portfolio yet"
        emptyHint="Buy shares in the Transaction Centre below — they'll show here under Stock Portfolio Overview."
        holdings={snapshotShareRows ?? stockOverviewSummary.holdings}
        baseCurrency="NZD"
        loading={!balancesReady}
        headerExtra={preview ? null : <HoldingsCsvImport assetType="stock" onImported={handleDataChanged} />}
        onAdd={openAdd}
        onBuy={(holding) => recordHolding(holding, "buy")}
        onSell={(holding) => recordHolding(holding, "sell")}
        onEdit={openEdit}
        onDelete={setDeleteTarget}
        onOpenChart={setChartTarget}
      />
      </DashboardGate>
      </div>
      ) : null}

      {/* ───────────────────────── 3b · Crypto currency overview ───────────────────────── */}
      {isCrypto ? (
      <div id="dash-crypto-overview" className="mt-10 scroll-mt-24">
      <DashboardGate
        preview={preview}
        title="Crypto Currency Overview"
        description="Crypto KPIs — total worth and P/L at the latest available price."
      >
        {/* Crypto hub return split and holdings table stay until PR5. */}
        <ReturnsSplitCard
          holdings={[...stockHoldings, ...cryptoHoldings, ...metalStocks]}
          incomeNzd={incomeNzd}
          rates={fxToNZD}
          split={returnSplit}
          loading={!balancesReady || !ledgerLoaded}
          scopeLabel="Whole book"
          reconciledLabel={reconciledLabel}
          blankReason={splitBlank}
        />
        <div className="mb-4 flex flex-wrap items-center justify-center gap-3">
          <CryptoLiveStatus updatedAt={cryptoLive.updatedAt ?? (Number.isFinite(cryptoBoardAt) ? cryptoBoardAt : null)} />
          <div className="inline-flex rounded-lg border border-border/60 p-0.5 text-xs font-semibold" role="group" aria-label="Crypto totals currency">
            {(["NZD", "USD"] as const).map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => setCryptoBookCurrency(code)}
                className={cn(
                  "rounded-md px-2.5 py-1 transition-colors",
                  cryptoBookCurrency === code ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                )}
                aria-pressed={cryptoBookCurrency === code}
              >
                {code === "NZD" ? "NZ$" : "US$"}
              </button>
            ))}
          </div>
        </div>

      <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={cryptoBookCurrency === "NZD" ? "Total worth · NZD" : "Total worth · USD"}
          value={cryptoWorth.text}
          title={cryptoWorth.title}
          sub={cryptoWorth.title || `Cost basis ${cryptoCostText}`}
          icon={Wallet}
          loading={!balancesReady}
        />
        <StatCard
          label={PL_AT_LATEST_PRICE}
          value={cryptoPnl.text}
          title={cryptoPnl.title}
          sub={cryptoPnl.title || `${cryptoGainPct == null ? "—" : formatPercent(cryptoGainPct)} · Crypto only, at today's rate. Excludes the currency effect in the split above.`}
          icon={cryptoPnl.value != null && cryptoPnl.value < 0 ? TrendingDown : TrendingUp}
          tone={cryptoPnl.value != null && cryptoPnl.value < 0 ? "down" : "up"}
          loading={!balancesReady}
        />
        {freePlan ? null : (
        <>
        <StatCard
          label="7-Day alpha potential"
          value={CRYPTO_PROJECTIONS_PAUSED || !cryptoOverviewMetrics.alphaKnown ? "Not enough history" : `${cryptoOverviewMetrics.alphaPotentialPct >= 0 ? "+" : ""}${cryptoOverviewMetrics.alphaPotentialPct.toFixed(2)}%`}
          sub={CRYPTO_PROJECTIONS_PAUSED ? CRYPTO_PROJECTIONS_PAUSE_MESSAGE : !cryptoOverviewMetrics.alphaKnown ? "Not enough history" : cryptoOverviewSummary.holdingsCount
              ? `${formatMoney(
                  cryptoBookCurrency === "NZD"
                    ? usdToNzd(cryptoOverviewMetrics.alphaPotentialValue, fxToNZD.USD)
                    : cryptoOverviewMetrics.alphaPotentialValue,
                  cryptoBookCurrency
                )} projected move`
              : "Add coins to project"
          }
          icon={Zap}
          tone={cryptoOverviewMetrics.alphaPotentialPct >= 0 ? "up" : "down"}
          loading={!balancesReady}
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
          loading={!balancesReady}
        />
        </>
        )}
      </div>
      {freePlan && CRYPTO_PROJECTIONS_PAUSED ? (
        <p className="mt-4 rounded-2xl border border-border/70 bg-card/40 p-4 text-sm text-muted-foreground">
          {CRYPTO_PROJECTIONS_PAUSE_MESSAGE}
        </p>
      ) : null}

      {!freePlan && cryptoOverviewSummary.holdingsCount > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-4 rounded-2xl border border-border/70 bg-card/40 p-4 sm:grid-cols-4">
          <MiniMetric icon={Activity} label="Ann. volatility" value={cryptoOverviewMetrics.enoughHistory ? `${cryptoOverviewMetrics.volatility.toFixed(1)}%` : "Not enough history"} />
          <MiniMetric icon={Gauge} label="Sharpe ratio" value={cryptoOverviewMetrics.enoughHistory ? cryptoOverviewMetrics.sharpe.toFixed(2) : "Not enough history"} />
          <MiniMetric icon={PieChart} label="Diversification" value={`${cryptoOverviewMetrics.diversification}%`} />
          <MiniMetric icon={Trophy} label="Win rate" value={cryptoOverviewMetrics.enoughHistory ? `${cryptoOverviewMetrics.winRate}%` : "Not enough history"} />
        </div>
      )}

      {/* Crypto hub return split and holdings table stay until PR5. */}
      <HoldingsOwnedTable
        title="Crypto you own"
        emptyLabel="No crypto in this portfolio yet"
        emptyHint="Buy coins in the Transaction Centre — they'll show here so you can see where the money is."
        holdings={snapshotCryptoRows ?? cryptoOverviewSummary.holdings}
        baseCurrency={cryptoBookCurrency}
        loading={!balancesReady}
        headerExtra={preview ? null : <HoldingsCsvImport assetType="crypto" onImported={handleDataChanged} />}
        nameLabel="Coin / Token"
        onAdd={openAdd}
        onBuy={(holding) => recordHolding(holding, "buy")}
        onSell={(holding) => recordHolding(holding, "sell")}
        onEdit={openEdit}
        onDelete={setDeleteTarget}
        onOpenChart={setChartTarget}
      />

      <div className="mt-6">
        <CryptoMarketSection showProjected={!freePlan} />
      </div>
      </DashboardGate>
      </div>
      ) : null}

      {/* ───────────────────────── 3c · Precious metals (moved up for page flow) ───────────────────────── */}
      <div id="dash-metals-overview" className={cn("mt-10 scroll-mt-24", !isMetals && "hidden")}>
        <PreciousMetals
          entitled={metalsEntitled}
          plan={subscription.plan}
          onChanged={handleMetalsChanged}
          ledgerLots={metalStocks}
          ledgerReady={!loading}
          spot={spotForMarks}
        />
        <div className="mt-6">
          <DashboardGate
            preview={preview}
            title="Metals Price Alerts"
            description="Set alerts on gold and silver so you never miss a move on your bullion."
          >
            <PriceAlerts
              stocks={metalAlertHoldings}
              assetType="metal"
              holdingsReady={!loading && metalsLoaded}
              preview={preview}
              canCreate={!freePlan}
            />
          </DashboardGate>
        </div>
      </div>

      {/* ───────────────────────── 4 · Totals owned (Stocks · Crypto · Cash · Metals) ───────────────────────── */}
      <div className={cn("mt-8 rounded-3xl border border-border/70 bg-gradient-to-br from-primary/8 to-card/50 p-6", (isHome || isMarket || isTransactions || isAlerts) && "hidden")}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Landmark className="size-4 text-primary" /> Totals owned
            </div>
            <p className="text-xs text-muted-foreground">
              {isMetals
                ? `Everything you hold, ${metalsSpotLive ? "Spot" : "Est."} in NZD`
                : "Everything you hold, in NZD"}
            </p>
          </div>
          {/* Live-updating market value + net worth — animates as prices move */}
          <div className="flex items-end gap-6">
            <div className="text-right">
              <p className="text-[0.68rem] uppercase tracking-wide text-muted-foreground">Holdings value · NZD</p>
              <BookMoney
                snap
                value={headerHoldings}
                reason={holdingsReason}
                loading={!balancesReady}
                skeletonClassName="mt-1 ml-auto h-6 w-24 animate-pulse rounded-md bg-muted/50"
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
              <BookMoney
                snap
                value={headerNet}
                reason={netReason}
                loading={!balancesReady}
                skeletonClassName="mt-1 ml-auto h-8 w-32 animate-pulse rounded-md bg-muted/50"
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
            <BookMoney
              snap
              value={headerCash}
              reason={cashReason}
              loading={!balancesReady}
              skeletonClassName="mt-3 h-9 w-40 animate-pulse rounded-md bg-primary/15"
              className="mt-3 block font-display text-3xl font-bold text-primary"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Cash available · falls on every buy, rises on every sell
            </p>
            {bookSnapshot?.cashWarning ? (
              <p className="mt-1 text-xs text-muted-foreground">{bookSnapshot.cashWarning}</p>
            ) : null}
            <div className="mt-3 flex items-center justify-between border-t border-primary/20 pt-2 text-xs">
              <span className="text-muted-foreground">Holdings value</span>
              <BookMoney
                snap
                value={headerHoldings}
                reason={holdingsReason}
                loading={!balancesReady}
                skeletonClassName="h-4 w-16 animate-pulse rounded bg-muted/50"
                className="font-semibold text-foreground"
              />
            </div>
          </div>
          <StatCard
            label="Value in Stocks · NZD"
            value={stockOwned.text}
            title={stockOwned.title}
            sub={stockOwned.title || `${stockHoldings.length} position${stockHoldings.length === 1 ? "" : "s"}`}
            icon={LineChart}
            loading={!balancesReady}
          />
          <StatCard
            label="Value in Crypto · NZD"
            value={cryptoOwned.text}
            title={cryptoOwned.title}
            sub={cryptoOwned.title || `${cryptoHoldings.length} coin${cryptoHoldings.length === 1 ? "" : "s"}`}
            icon={Bitcoin}
            loading={!balancesReady}
          />
          <StatCard
            label="Value in Metals · NZD"
            value={metalsOwned.text}
            title={metalsOwned.title}
            sub={
              metalsOwned.title ||
              (metalStocks.length > 0
                ? `${metalStocks.length} bullion position${metalStocks.length === 1 ? "" : "s"} + spot`
                : "Gold & silver at spot")
            }
            icon={Coins}
            loading={!balancesReady}
          />
        </div>

        {/* Allocation for this hub. Metals must not reuse the stock label or book. */}
        {allocationSummary.sectorAllocation.length > 0 && (
          <div className="mt-5 rounded-2xl border border-border/60 bg-background/30 p-5">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <PieChart className="size-4 text-primary" /> {allocationLabel}
            </div>
            <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-muted/40">
              {allocationSummary.sectorAllocation.map((s, i) => (
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
              {allocationSummary.sectorAllocation.map((s, i) => (
                <div key={s.sector} className="flex items-center gap-3">
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: SECTOR_COLORS[i % SECTOR_COLORS.length] }}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm">{s.sector}</span>
                  <span className="tnum text-sm text-muted-foreground">
                    {formatMoney(s.value, allocationCurrency, { compact: true })}
                  </span>
                  <span className="tnum w-12 text-right text-sm font-medium">{s.weight.toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ───────────────────────── 5 · Holdings table (gated for guests) ───────────────────────── */}
      <div className={cn("mt-8", !isStocks && "hidden")}>
      <DashboardGate
        preview={preview}
        title="Your Holdings"
        description="Track every position live — shares, cost, current price, market value and gain/loss."
      >
      <div className="rounded-3xl border border-border/70 bg-card/50">
        <div className="flex items-center justify-between border-b border-border/60 px-6 py-4">
          <div>
            <h2 className="font-display text-lg font-bold">Your holdings</h2>
            <p className="text-xs text-muted-foreground">Cost method: FIFO (first in, first out).</p>
          </div>
          <span className="text-xs text-muted-foreground">
            {!balancesReady
              ? "…"
              : tableHoldings.length === 0
                ? "No open positions"
                : `${tableHoldings.length} position${tableHoldings.length === 1 ? "" : "s"}`}
          </span>
        </div>

        {!balancesReady ? (
          <div className="space-y-3 p-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-muted/40" />
            ))}
          </div>
        ) : tableHoldings.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <span className="grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary">
              <Wallet className="size-7" />
            </span>
            <p className="mt-4 font-medium">Your portfolio is empty</p>
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">
              Record a transaction to start tracking gains, losses, and allocation.
            </p>
            <Button onClick={openAdd} className="mt-5 font-semibold">
              <Plus className="mr-2 size-4" /> Add your first holding
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[56rem] text-xs">
              <thead>
                <tr className="border-b border-border/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="px-3 py-2"><HoldingHead label="Ticker" k="ticker" align="left" /></th>
                  <th scope="col" className="px-2 py-2"><HoldingHead label="Company" k="company" align="left" /></th>
                  <th scope="col" className="px-2 py-2"><HoldingHead label="Qty" k="shares" /></th>
                  <th scope="col" className="px-2 py-2"><HoldingHead label="Paid" k="purchase_price" /></th>
                  <th scope="col" className="px-2 py-2"><HoldingHead label="Now" k="current_price" /></th>
                  <th scope="col" className="px-2 py-2"><HoldingHead label="Value" k="marketValue" /></th>
                  <th scope="col" className="px-2 py-2"><HoldingHead label="%" k="weight" /></th>
                  <th scope="col" className="px-2 py-2"><HoldingHead label="Gain" k="gain" /></th>
                  <th scope="col" className="sticky right-0 w-36 bg-card px-2 py-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedHoldings.map((h) => {
                  const priced = Number.isFinite(h.current_price);
                  const gained = Number.isFinite(h.gain);
                  const up = gained && h.gain >= 0;
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
                              name: holdingTitle(h),
                              exchange,
                              currency: h.currency,
                              purchasePrice: h.purchase_price,
                              currentPrice: h.current_price,
                            })
                          }
                          className="group/tk flex items-center gap-3 rounded-lg text-left transition-colors hover:text-primary"
                          aria-label={`${h.ticker}, ${h.currency}`}
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
                      <td className="px-2 py-2">
                        <p className="truncate text-muted-foreground">
                          {holdingTitle(h)}
                        </p>
                        <p className="truncate text-[0.65rem] text-muted-foreground">
                          {h.purchase_date ? `first bought ${formatHoldingDate(h.purchase_date)}` : "—"} · {exchange}
                        </p>
                      </td>
                      {/* # shares */}
                      <td className="tnum px-3 py-3.5 text-right text-muted-foreground">
                        {formatNumber(h.shares)}
                      </td>
                      {/* Price paid / share */}
                      <td className="tnum px-3 py-3.5 text-right text-muted-foreground">
                        {Number.isFinite(h.purchase_price) ? formatUnitPrice(h.purchase_price, h.currency) : "—"}
                      </td>
                      {/* Current price / share */}
                      <td className="tnum px-3 py-3.5 text-right" title={priced ? undefined : "No price is stored for this holding."}>
                        {priced ? formatUnitPrice(h.current_price, h.currency) : "—"}
                      </td>
                      {/* Current total market value */}
                      <td className="tnum px-3 py-3.5 text-right font-medium" title={Number.isFinite(h.baseValue) ? undefined : "No price is stored for this holding."}>
                        {Number.isFinite(h.marketValue) ? formatMoney(h.marketValue, h.currency) : "—"}
                        {h.currency !== baseCurrency && Number.isFinite(h.baseValue) && (
                          <span className="block text-[0.68rem] font-normal text-muted-foreground">
                            ≈ {formatMoney(h.baseValue, baseCurrency)}
                          </span>
                        )}
                      </td>
                      {/* % of Portfolio — this holding's share of total portfolio value */}
                      <td className="px-3 py-3.5 text-right">
                        <div className="flex flex-col items-end gap-1">
                          <span className="tnum font-medium">{Number.isFinite(h.weight) ? `${h.weight.toFixed(1)}%` : "—"}</span>
                          <span className="h-1 w-10 overflow-hidden rounded-full bg-muted/50">
                            <span
                              className="block h-full rounded-full bg-primary/70"
                              style={{ width: `${Number.isFinite(h.weight) ? Math.min(100, Math.max(2, h.weight)) : 0}%` }}
                            />
                          </span>
                        </div>
                      </td>
                      {/* Gain / Loss */}
                      <td className="px-3 py-3.5 text-right">
                        <span className={cn("tnum font-medium", !gained ? "text-muted-foreground" : up ? "text-emerald-700" : "text-rose-600")} title={gained ? undefined : "No price is stored for this holding."}>
                          {gained ? formatSignedMoney(h.gain, h.currency) : "—"}
                        </span>
                        <span
                          className={cn("tnum ml-1 block text-xs", !gained ? "text-muted-foreground" : up ? "text-emerald-700/80" : "text-rose-600/80")}
                        >
                          {Number.isFinite(h.gainPct) ? formatPercent(h.gainPct) : "—"}
                        </span>
                      </td>
                      {/* Actions */}
                      <td className="sticky right-0 bg-card px-2 py-3.5">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => recordHolding(h, "buy")}
                            className="rounded-md px-1.5 py-1 text-[0.65rem] font-semibold text-primary hover:bg-primary/10"
                          >
                            Buy
                          </button>
                          <button
                            type="button"
                            onClick={() => recordHolding(h, "sell")}
                            className="rounded-md px-1.5 py-1 text-[0.65rem] font-semibold text-rose-600 hover:bg-rose-500/10"
                          >
                            Sell
                          </button>
                          <button
                            type="button"
                            onClick={() => openEdit(h)}
                            className="relative z-10 grid size-8 shrink-0 place-items-center rounded-lg text-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                            aria-label={`Edit ${h.ticker}`}
                          >
                            <Pencil className="size-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(h)}
                            className="relative z-10 grid size-8 shrink-0 place-items-center rounded-lg text-foreground transition-colors hover:bg-destructive/15 hover:text-destructive"
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
      </DashboardGate>
      </div>


      {/* Share / crypto price alerts — directly under Your Holdings */}
      <div className={cn("mt-6", !(isStocks || isCrypto) && "hidden")}>
        <DashboardGate
          preview={preview}
          title={isCrypto ? "Crypto Price Alerts" : "Share Price Alerts"}
          description={
            isCrypto
              ? "Set live crypto price alerts so you never miss a move on the coins you hold or follow."
              : "Set live share-price alerts so you never miss a move on the tickers you hold or follow."
          }
        >
          <PriceAlerts
            stocks={isCrypto ? cryptoMarked : stockOnly}
            assetType={isCrypto ? "crypto" : "stock"}
            holdingsReady={!loading}
            preview={preview}
            canCreate={!freePlan}
          />
        </DashboardGate>
      </div>

      {/* /alerts and /notifications land here. Price alerts are the in-app notifications. */}
      {isAlerts && (
        <div id="dash-alerts" className="mt-8 space-y-6">
          {!preview ? <WatchAlerts canCreate={!freePlan} /> : null}
          <p className="max-w-2xl text-sm text-muted-foreground">
            Share, crypto, and metals price alerts are the notifications for this paper book. A triggered
            alert shows in the matching list.
          </p>
          <DashboardGate
            preview={preview}
            title="Share Price Alerts"
            description="Set live share-price alerts so you never miss a move on the tickers you hold or follow."
          >
            <PriceAlerts
              stocks={stockOnly}
              assetType="stock"
              holdingsReady={!loading}
              preview={preview}
              canCreate={!freePlan}
            />
          </DashboardGate>
          <DashboardGate
            preview={preview}
            title="Crypto Price Alerts"
            description="Set live crypto price alerts so you never miss a move on the coins you hold or follow."
          >
            <PriceAlerts
              stocks={cryptoMarked}
              assetType="crypto"
              holdingsReady={!loading}
              preview={preview}
              canCreate={!freePlan}
            />
          </DashboardGate>
          <DashboardGate
            preview={preview}
            title="Metals Price Alerts"
            description="Set alerts on gold and silver so you never miss a move on your bullion."
          >
            <PriceAlerts
              stocks={metalAlertHoldings}
              assetType="metal"
              holdingsReady={!loading && metalsLoaded}
              preview={preview}
              canCreate={!freePlan}
            />
          </DashboardGate>
        </div>
      )}


      {/* ───────────────────────── 6 · Transaction centre (buy / sell / cash) — gated for guests ───────────────────────── */}
      <div className={cn("mt-8", !(isCash || isTransactions || isStocks || isCrypto) && "hidden")}>
      <DashboardGate
        preview={preview}
        title="Transaction Centre"
        description="Buy, sell, deposit and withdraw — a full ledger of your cash and trades across every asset."
      >
        <TransactionCenter
          holdings={transactionHoldings}
          onChanged={handleDataChanged}
          reloadSignal={ledgerSignal}
          preview={preview}
          userId={userId}
          csvAllowed={!freePlan}
          preferredAssetType={
            isStocks ? "stock" : isCrypto ? "crypto" : undefined
          }
          layout={isTransactions ? "ledger" : isCash ? "full" : "trading"}
        />
      </DashboardGate>
      </div>


      {/* ───────────────────────── 6 · Actionable intelligence — SELL/BUY signals + pathways (modular window) ───────────────────────── */}
      <div className={cn("mt-6", !(isStocks || isCrypto) && "hidden")}>
        <CollapsibleSection
          title="Informational signals"
          icon={Radar}
          defaultOpen
        >
          {freePlan ? (
            <p className="text-sm text-muted-foreground">
              Informational signals beyond basic P/L are on a paid plan.{" "}
              <a href="/pricing" className="font-medium text-primary hover:underline">See plans</a>
            </p>
          ) : (
          <ActionableIntelligence stocks={stocks} assetClass={bot} onBought={handleDataChanged} />
          )}
        </CollapsibleSection>
      </div>


      {/* ───────────────────────── 7 · Market Insights — one modular window: cross-exchange browser, snapshot, movers & projected performers ───────────────────────── */}
      <div className={cn("mt-6", !(isStocks || isCrypto) && "hidden")}>
        <CollapsibleSection
          title="Market Insights"
          subtitle={
            isCrypto
              ? "Coin browser, market pulse, top movers and projected performers"
              : "Cross-exchange browser, open-market snapshot, top movers and projected performers"
          }
          icon={Compass}
        >
          <div className={cn("grid gap-4", !isCrypto && "lg:grid-cols-2")}>
            <AllMarkets onBought={handleDataChanged} scope={isCrypto ? "crypto" : "equity"} />
            {isCrypto ? null : <OpenMarketSnapshot onBought={handleDataChanged} />}
          </div>
          <div className="mt-8">
            <TopMovers assetClass={isCrypto ? "crypto" : "equity"} />
          </div>
          <div className="mt-8">
            {freePlan ? (
              <p className="text-sm text-muted-foreground">
                {isCrypto && CRYPTO_PROJECTIONS_PAUSED ? (
                  CRYPTO_PROJECTIONS_PAUSE_MESSAGE
                ) : (
                  <>
                    Projected performers are on a paid plan.{" "}
                    <a href="/pricing" className="font-medium text-primary hover:underline">See plans</a>
                  </>
                )}
              </p>
            ) : (
            <MarketWidePerformers onBought={handleDataChanged} />
            )}
          </div>
        </CollapsibleSection>
      </div>

      {/* ───────────────────────── 10 · Watchlist (gated for guests) ───────────────────────── */}
      <div className={cn("mt-6", !(isStocks || isCrypto) && "hidden")}>
      <div className="mt-6">
      <DashboardGate
        preview={preview}
        title="Watchlist"
        description="Track tickers you follow — add names to your watchlist so you never lose sight of them."
      >
      <div>
        <WatchlistPanel bot={bot} reloadSignal={watchlistSignal} preview={preview} cardId="watchlist-panel" />
      </div>
      </DashboardGate>
      </div>

      {/* AI report companion */}
      <div className="mt-6">
        <AnalysisPanel holdingsCount={summary.holdingsCount} scope={isCrypto ? "crypto" : "equity"} />
      </div>

      {/* ───────────────────────── 11 · Report Center (The Headmaster + Stox + Koins) — gated for guests ───────────────────────── */}



      {/* Report Centre at foot of stocks/crypto overview — generators first, reports list below (minimizable) */}
      {(isStocks || isCrypto) && (
      <div id="dash-report-centre-hub" className="mt-10 scroll-mt-24">
      <DashboardGate
        preview={preview}
        title="Report Centre"
        description="Generate full PDF portfolio reports with market intelligence, indicators and AI insight. Email is sent only when delivery succeeds."
      >
        <ReportCenter
          botAccess={subscription.botAccess}
          plan={subscription.plan}
          scope={scope}
          counts={holdingCounts}
          countsReady={preview || !loading}
          tickerLimit={tickerLimit}
          userId={userId}
          holdings={allStocks}
          onHoldingsChanged={handleDataChanged}
          preview={preview}
          seed={deskSeed}
        />
      </DashboardGate>
      </div>
      )}

      {/* Buy/Add is mounted once from the root layout (TransactionDialogHost),
          not under this stocks/transactions tree. A live-price hydrate on
          /dashboard/stocks must not remount it mid ticker-search. */}

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
              {deleteTarget
                ? (() => {
                    const position = bookSnapshot?.groups
                      .flatMap((group) => group.positions)
                      .find((row) => row.holdingId === deleteTarget._id || row.ticker.toUpperCase() === deleteTarget.ticker.toUpperCase());
                    const effect = holdingDeleteEffect({
                      cash: bookSnapshot?.kpis.cash.value ?? null,
                      unrealised: position?.unrealised.value ?? null,
                      realised: position?.realised.value ?? null,
                    });
                    return `This removes ${formatNumber(deleteTarget.shares)} of ${deleteTarget.ticker}. Cash before ${effect.cashBefore}. Cash after ${effect.cashAfter}. ${effect.cashReason} Unrealised now ${effect.unrealisedNow}. After remove ${effect.unrealisedAfter}. ${effect.realisedNote} Cancel keeps the holding.`;
                  })()
                : "Cancel keeps the holding."}
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
    </div>
    </MarketIntelProvider>
  );
}
