"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import {
  computeSummary,
  formatCurrency,
  formatPercent,
  formatNumber,
  type Stock,
} from "@/lib/portfolio";
import { StockDialog } from "@/components/dashboard/StockDialog";
import { AnalysisPanel } from "@/components/dashboard/AnalysisPanel";
import { ReportCenter } from "@/components/dashboard/ReportCenter";
import { PriceAlerts } from "@/components/dashboard/PriceAlerts";
import { YearlyToolkit } from "@/components/dashboard/YearlyToolkit";
import { planLabel } from "@/lib/plans";
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
} from "lucide-react";

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

export function PortfolioDashboard({
  userName,
  subscription,
}: {
  userName: string;
  subscription: DashboardSubscription;
}) {
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Stock | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Stock | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadStocks = useCallback(async () => {
    const res = await api.get<Stock[]>("/api/stocks");
    if (res.ok && res.data) {
      setStocks(res.data);
    } else {
      console.error("[dashboard] Failed to load stocks:", res.error);
      toast.error("Could not load your portfolio.");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadStocks();
  }, [loadStocks]);

  const summary = useMemo(() => computeSummary(stocks), [stocks]);

  async function handleRefreshPrices() {
    setRefreshing(true);
    console.log("[dashboard] Refreshing market prices…");
    const res = await api.post<Stock[]>("/api/stocks/refresh", {});
    if (res.ok && res.data) {
      setStocks(res.data);
      toast.success("Prices updated");
    } else {
      console.error("[dashboard] Refresh failed:", res.error);
      toast.error("Could not refresh prices.");
    }
    setRefreshing(false);
  }

  function openAdd() {
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

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Welcome back, {userName.split(" ")[0]}</p>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight">Portfolio overview</h1>
        </div>
        <div className="flex items-center gap-2">
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
          <Button onClick={openAdd} className="font-semibold shadow-glow">
            <Plus className="mr-2 size-4" /> Add holding
          </Button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total value"
          value={formatCurrency(summary.totalValue)}
          sub={`Cost basis ${formatCurrency(summary.totalCost)}`}
          icon={Wallet}
        />
        <StatCard
          label="Total gain / loss"
          value={formatCurrency(summary.totalGain)}
          sub={formatPercent(summary.totalGainPct)}
          icon={summary.totalGain >= 0 ? TrendingUp : TrendingDown}
          tone={gainTone}
        />
        <StatCard
          label="Best performer"
          value={summary.bestPerformer ? summary.bestPerformer.ticker : "—"}
          sub={
            summary.bestPerformer ? formatPercent(summary.bestPerformer.gainPct) : "No holdings yet"
          }
          icon={Trophy}
          tone={summary.bestPerformer && summary.bestPerformer.gain >= 0 ? "up" : "neutral"}
        />
        <StatCard
          label="Holdings"
          value={String(summary.holdingsCount)}
          sub={`${summary.sectorAllocation.length} sector${
            summary.sectorAllocation.length === 1 ? "" : "s"
          }`}
          icon={Layers}
        />
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
              {subscription.tickerLimit ? `${subscription.tickerLimit} per bot` : "—"}
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
          monitoredCount={summary.holdingsCount}
          tickerLimit={subscription.tickerLimit}
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
                              <p className="font-semibold">{h.ticker}</p>
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
                          {formatCurrency(h.purchase_price)}
                        </td>
                        <td className="tnum px-3 py-3.5 text-right">
                          {formatCurrency(h.current_price)}
                        </td>
                        <td className="tnum px-3 py-3.5 text-right font-medium">
                          {formatCurrency(h.marketValue)}
                        </td>
                        <td className="px-3 py-3.5 text-right">
                          <span
                            className={cn(
                              "tnum font-medium",
                              up ? "text-emerald-400" : "text-rose-400"
                            )}
                          >
                            {formatCurrency(h.gain)}
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
                      {formatCurrency(s.value, { compact: true })}
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

      {/* AI Report */}
      <div className="mt-6">
        <AnalysisPanel holdingsCount={summary.holdingsCount} />
      </div>

      <StockDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        onSaved={loadStocks}
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
  );
}
