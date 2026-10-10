"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { ADVISORY_NOTE } from "@/lib/fill-integrity-client";
import { formatDisplayDate, formatMoney, formatSavedFx, formatSignedMoney, formatUnitPrice, currencyForTicker, type CurrencyCode } from "@/lib/currency";
import { useFxRates } from "@/hooks/useFxRates";
import { buildTradePreview, type TradePreview } from "@/lib/trade-preview";
import { ledgerDisplayedCash } from "@/lib/ledger-cash-lines";
import { bumpHoldingsGeneration } from "@/lib/holdings-generation";
import { useTradeReviewGate } from "@/lib/trade-review-gate";
import { TradeReview } from "@/components/dashboard/TradeReview";
import { formatNumber, type Stock } from "@/lib/portfolio";
import { lookupTicker } from "@/lib/market";
import { CRYPTO_DIRECTORY } from "@/lib/apex";
import { TickerSearch } from "@/components/dashboard/TickerSearch";
import { CryptoSearch } from "@/components/dashboard/CryptoSearch";
import { cn } from "@/lib/utils";
import {
  keepDialogOpenOnPortalInteraction,
  keepDialogOpenWhilePopoverOpen,
  guardDialogOpenChange,
  debugTcDialog,
  isDialogSearchActive,
  type DialogCloseReason,
} from "@/lib/dialog-guards";
import {
  getStickyTxOpen,
  getStickyTxMode,
  setStickyTxOpen,
  setStickyTxMode,
  bindTransactionStickyUser,
  type StickyTxMode,
} from "@/lib/transaction-sticky";
import {
  acceptAccountPayload,
  bindActiveAccount,
  getAccountEpoch,
  responseUserId,
  trackAccountRequest,
} from "@/lib/account-identity";
import {
  getTxDialogSnapshot,
  publishTxDialog,
  setTxDialogHandlers,
  type TxSeed,
} from "@/lib/transaction-dialog-store";
import { toast } from "sonner";
import {
  ArrowLeftRight,
  Plus,
  Minus,
  Loader2,
  Lock,
  CalendarDays,
  Info,
  Wallet,
  PiggyBank,
  TrendingUp,
  TrendingDown,
  Banknote,
  Receipt,
  ArrowDownToLine,
  ArrowUpFromLine,
  FolderOpen,
  Search,
  Download,
  X,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

type TxType = "buy" | "sell" | "deposit" | "withdraw" | "dividend" | "tax" | "opening_balance" | "correction";
type AssetType = "stock" | "crypto" | "metal";

/** Buyable asset classes shown in the Buy dialog — metals expand to Gold + Silver. */
const BUY_ASSETS: { key: string; label: string; assetType: AssetType; ticker?: string; name?: string }[] = [
  { key: "stock", label: "Stox · Stocks", assetType: "stock" },
  { key: "crypto", label: "Koins · Crypto", assetType: "crypto" },
  { key: "gold", label: "Gold", assetType: "metal", ticker: "GOLD", name: "Gold bullion" },
  { key: "silver", label: "Silver", assetType: "metal", ticker: "SILVER", name: "Silver bullion" },
];

interface TransactionRow {
  _id: string;
  type: TxType;
  ticker?: string;
  asset_name?: string;
  asset_type?: string;
  quantity?: number;
  price?: number;
  fees?: number;
  fees_native?: number;
  total?: number;
  realized_pnl?: number;
  currency?: string;
  fx_rate?: number | null;
  cash_nzd?: number;
  fees_nzd?: number;
  notes?: string;
  executed_at?: string;
  createdAt?: string;
}

interface Ledger {
  transactions: TransactionRow[];
  cashBalance: number;
  realizedYtd: number;
  realizedTotal: number;
  realizedYtdCount: number;
}

const NZD: CurrencyCode = "NZD";

function savedFxLabel(row: { fx_rate?: number | null }): string {
  return formatSavedFx(row.fx_rate) || "—";
}

function feeAmount(t: { fees?: number; fees_native?: number }): number {
  const n = Number(t.fees_native ?? t.fees);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Survive parent remounts during holdings live-price hydrate / soft-refresh.
 * Sticky open/mode live in `@/lib/transaction-sticky` and are cleared on userId
 * change so they cannot leak Buy/Add across accounts in the same tab.
 */
export { isTransactionDialogOpen } from "@/lib/transaction-sticky";


/** Local yyyy-mm-dd for "today" — the boundary that flips the live-price lock on/off. */
function todayISO(): string {
  const d = new Date();
  // Use local date parts so "today" matches the user's calendar, not UTC.
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 10);
}

function rowCash(t: TransactionRow): number {
  return ledgerDisplayedCash({
    type: t.type,
    total: t.total,
    cash_nzd: t.cash_nzd,
    fees_nzd: t.fees_nzd ?? t.fees,
    quantity: t.quantity,
  });
}

const TYPE_META: Record<TxType, { label: string; icon: React.ElementType; cls: string }> = {
  buy: { label: "Buy", icon: Plus, cls: "bg-emerald-500/15 text-emerald-600" },
  sell: { label: "Sell", icon: Minus, cls: "bg-rose-500/15 text-rose-600" },
  deposit: { label: "Deposit", icon: ArrowDownToLine, cls: "bg-sky-500/15 text-sky-600" },
  withdraw: { label: "Withdraw", icon: ArrowUpFromLine, cls: "bg-amber-500/15 text-amber-600" },
  dividend: { label: "Dividend", icon: PiggyBank, cls: "bg-emerald-500/15 text-emerald-700" },
  tax: { label: "Tax", icon: Receipt, cls: "bg-rose-500/15 text-rose-700" },
  opening_balance: { label: "Opening balance", icon: Banknote, cls: "bg-sky-500/15 text-sky-700" },
  correction: { label: "Correction", icon: ArrowLeftRight, cls: "bg-muted text-muted-foreground" },
};

/** A KPI tile matching the dashboard's card language. */
function CashCard({
  label,
  value,
  sub,
  icon: Icon,
  tone = "neutral",
  loading = false,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  tone?: "neutral" | "up" | "down";
  loading?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border/70 bg-card/50 p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
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
      {loading ? (
        <div className="mt-3 h-8 w-36 animate-pulse rounded-md bg-muted/50" aria-hidden />
      ) : (
      <p
        className={cn(
          "tnum mt-3 font-display text-2xl font-bold",
          tone === "up" && "text-emerald-600",
          tone === "down" && "text-rose-600"
        )}
      >
        {value}
      </p>
      )}
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function CashLineSection({
  title,
  empty,
  rows,
}: {
  title: string;
  empty: string;
  rows: TransactionRow[];
}) {
  return (
    <section className="rounded-2xl border border-border/60 bg-card/40 p-4">
      <h3 className="font-display text-sm font-bold tracking-wide">{title}</h3>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {rows.map((row) => {
            const amount = rowCash(row);
            return (
              <li key={row._id} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0">
                  <span className="font-medium">{row.asset_name || title}</span>
                  {row.notes ? <span className="mt-0.5 block truncate text-xs text-muted-foreground">{row.notes}</span> : null}
                </span>
                <span className={cn("tnum shrink-0 font-semibold", amount >= 0 ? "text-emerald-600" : "text-rose-600")}>
                  {formatSignedMoney(amount, NZD)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Holding that may originate from the dedicated precious_metal table. */
type SellableHolding = Stock & { metalSourceId?: string };

export function TransactionCenter({
  holdings,
  onChanged,
  reloadSignal,
  preview = false,
  preferredAssetType,
  layout = "full",
  userId = null,
}: {
  /** Current holdings (both bots + precious metals) — used to power the Sell picker. */
  holdings: SellableHolding[];
  /** Called after any trade so the parent can reload holdings + prices. */
  onChanged: () => void;
  /** Increment to force a ledger reload (e.g. after a metals buy/sell elsewhere). */
  reloadSignal?: number;
  /** Guest preview — read-only, no network calls. */
  preview?: boolean;
  /** Pre-select stock/crypto/metal when opening Buy/Sell from a hub page. */
  preferredAssetType?: "stock" | "crypto" | "metal";
  /** full = trading + ledger; trading = buy/sell focused; ledger = spreadsheet focused. */
  layout?: "full" | "trading" | "ledger";
  /** Authenticated user id — binds sticky dialog + ignores stale ledger responses. */
  userId?: string | null;
}) {
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [loading, setLoading] = useState(!preview);
  const [open, setOpenRaw] = useState(() => getStickyTxOpen());
  const [allOpen, setAllOpen] = useState(false);
  const [mode, setModeRaw] = useState<TxType>(() => getStickyTxMode());
  const [deepLinkAsset, setDeepLinkAsset] = useState<"stock" | "crypto" | "metal" | null>(null);
  const loadGenRef = useRef(0);
  const activeUserIdRef = useRef<string | null>(userId ?? null);

  const cashRef = useRef(0);
  const cashKnownRef = useRef(false);
  const pendingSeedRef = useRef<TxSeed | null>(null);
  const preferredRef = useRef(preferredAssetType ?? null);
  preferredRef.current = preferredAssetType ?? null;
  // Latest holdings while closed; frozen once Buy/Add opens (see below).
  const holdingsFrozenRef = useRef(holdings);
  if (!open) holdingsFrozenRef.current = holdings;

  // Bind sticky Buy/Add to this user. Only an actual account switch clears the
  // open dialog — a remount during holdings hydrate must leave it alone.
  useEffect(() => {
    bindTransactionStickyUser(userId ?? null);
    bindActiveAccount(userId ?? null);
    const switched =
      activeUserIdRef.current != null && userId != null && activeUserIdRef.current !== userId;
    activeUserIdRef.current = userId ?? null;
    if (switched) {
      setLedger(null);
      publishTxDialog({ open: false, userId });
      setOpenRaw(false);
      return;
    }
    if (userId && getStickyTxOpen() && !getTxDialogSnapshot().open) {
      setOpenRaw(true);
      setModeRaw(getStickyTxMode());
      publishTxDialog({
        open: true,
        userId,
        mode: getStickyTxMode(),
        holdings: holdingsFrozenRef.current,
        cash: cashRef.current,
        cashKnown: cashKnownRef.current,
        preferredAssetType: preferredRef.current,
      });
    }
  }, [userId]);

  const setOpen = useCallback((next: boolean) => {
    debugTcDialog("setOpen", {
      next,
      prevSticky: getStickyTxOpen(),
      searchActive: isDialogSearchActive(),
      userId: activeUserIdRef.current,
    });
    // Never clear sticky open on a blocked/spurious close — guardDialogOpenChange
    // is the gate; by the time we get here the close was allowed (or is open=true).
    setStickyTxOpen(next);
    setOpenRaw(next);
    if (next) {
      publishTxDialog({
        open: true,
        userId: activeUserIdRef.current,
        mode: getStickyTxMode(),
        holdings: holdingsFrozenRef.current,
        cash: cashRef.current,
        cashKnown: cashKnownRef.current,
        preferredAssetType: preferredRef.current,
        seed: pendingSeedRef.current,
      });
    } else {
      pendingSeedRef.current = null;
      publishTxDialog({ open: false });
    }
  }, []);
  const setMode = useCallback((next: TxType) => {
    setStickyTxMode(next as StickyTxMode);
    setModeRaw(next);
  }, []);

  // Re-hydrate sticky open after an unexpected remount (holdings hydrate race).
  useEffect(() => {
    if (getStickyTxOpen() && !open) {
      setOpenRaw(true);
      setModeRaw(getStickyTxMode());
    }
  }, [open]);

  const load = useCallback(async () => {
    if (preview) return; // guest preview: no live ledger fetch
    const tracked = trackAccountRequest();
    activeUserIdRef.current = tracked.userId;
    const gen = ++loadGenRef.current;
    setLoading(true);
    try {
      const res = await api.get<Ledger & { userId?: string }>("/api/transactions", {
        signal: tracked.signal,
      });
      // Superseded fetch, account switch, or a body that isn't the active user.
      if (gen !== loadGenRef.current) return;
      if (res.aborted || tracked.epoch !== getAccountEpoch()) return;
      const echoed = responseUserId(res);
      if (res.status === 409 || res.error === "account-mismatch") {
        console.error("[transaction-center] Discarding ledger for other/stale user", {
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
            rows: res.data.transactions,
          })
        ) {
          console.error("[transaction-center] Discarding ledger for other/stale user", {
            requestUserId: tracked.userId,
            responseUserId: echoed,
          });
          return;
        }
        setLedger(res.data);
        setLoading(false);
      } else {
        console.error("[transaction-center] Failed to load ledger:", res.error);
        setLoading(false);
      }
    } finally {
      tracked.release();
    }
  }, [preview, userId]);

  useEffect(() => {
    load();
  }, [load, reloadSignal]);

  // Deep-link: /dashboard/transactions?buy=gold|silver|metal opens gold or silver
  // already filled in. The seed is set before publish so a stocks-page preference
  // cannot land the panel on shares.
  useEffect(() => {
    if (preview || typeof window === "undefined") return;
    try {
      const params = new URLSearchParams(window.location.search);
      const buy = (params.get("buy") || "").toLowerCase();
      if (buy !== "metal" && buy !== "gold" && buy !== "silver" && buy !== "stock" && buy !== "crypto") return;
      const metal = buy === "silver" ? "SILVER" : "GOLD";
      if (buy === "metal" || buy === "gold" || buy === "silver") {
        preferredRef.current = "metal";
        setDeepLinkAsset("metal");
        pendingSeedRef.current = {
          ticker: metal,
          name: buy === "silver" ? "Silver" : "Gold",
          assetType: "metal",
        };
      } else {
        preferredRef.current = buy;
        setDeepLinkAsset(buy);
        pendingSeedRef.current = null;
      }
      setMode("buy");
      setOpen(true);
      params.delete("buy");
      const qs = params.toString();
      const next = window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash;
      window.history.replaceState({}, "", next);
    } catch {
      /* ignore */
    }
  }, [preview, setMode, setOpen]);

  function openMode(m: TxType, seed: TxSeed | null = null) {
    pendingSeedRef.current = seed;
    setMode(m);
    setOpen(true);
  }

  const effectivePreferredAsset = deepLinkAsset || preferredAssetType;
  const cash = ledger?.cashBalance ?? 0;
  const cashKnown = ledger != null;
  cashRef.current = cash;
  cashKnownRef.current = cashKnown;
  preferredRef.current = effectivePreferredAsset ?? null;
  // Ledger can arrive after Buy is already open. Settle cash in place so the
  // review form does not keep the pre-load NZ$0.
  useEffect(() => {
    if (!cashKnown) return;
    publishTxDialog({ cash, cashKnown: true });
  }, [cashKnown, cash]);

  const realizedYtd = ledger?.realizedYtd ?? 0;
  const realizedTotal = ledger?.realizedTotal ?? 0;

  // Dialog lives in TransactionDialogHost (root layout, not this subtree) so a
  // holdings/cash soft-refresh on /dashboard/stocks cannot remount it.
  setTxDialogHandlers({
    onDone: (updated) => {
      if (updated && typeof updated === "object" && "cashBalance" in updated) {
        setLedger(updated as Ledger);
      }
      onChanged();
    },
    onOpenChange: (next) => setOpen(next),
  });

  return (
    <>
    <div className="mb-3 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
      {ADVISORY_NOTE} Realised P&amp;L splits price vs exchange rate; the mark price is unrealised only.
    </div>
    <div className="rounded-3xl border border-border/70 bg-card/50">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-6 py-4">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-lg bg-primary/12 text-primary">
            <ArrowLeftRight className="size-4" />
          </span>
          <div>
            <h2 className="font-display text-lg font-bold">Transaction Centre</h2>
            <p className="text-xs text-muted-foreground">
              One panel records every movement. Trades adjust holdings and cash together.
            </p>
          </div>
        </div>
        <Button size="sm" onClick={() => openMode("buy")} data-layout-trading="1" className="font-semibold shadow-glow">
          <Plus className="mr-1.5 size-4" /> Record a transaction
        </Button>
      </div>

      {/* Cash + realized KPIs */}
      <div className="grid gap-4 p-6 sm:grid-cols-3">
        <CashCard
          label="Cash balance · NZD"
          value={formatMoney(cash, NZD)}
          sub="Available to invest"
          icon={Wallet}
          loading={loading}
        />
        <CashCard
          label="Realised P&L (price + FX) · YTD"
          value={formatMoney(realizedYtd, NZD)}
          sub={
            ledger?.realizedYtdCount
              ? `From ${ledger.realizedYtdCount} closed sale${ledger.realizedYtdCount === 1 ? "" : "s"}`
              : "No closed sales yet this year"
          }
          icon={realizedYtd >= 0 ? TrendingUp : TrendingDown}
          tone={realizedYtd > 0 ? "up" : realizedYtd < 0 ? "down" : "neutral"}
          loading={loading}
        />
        <CashCard
          label="Realised P&L · All-time"
          value={formatMoney(realizedTotal, NZD)}
          sub="Across every closed position"
          icon={PiggyBank}
          tone={realizedTotal > 0 ? "up" : realizedTotal < 0 ? "down" : "neutral"}
          loading={loading}
        />
      </div>

      {/* Recent ledger — compact 5-row summary; full history lives in the modal */}
      <div className="px-6 pb-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Receipt className="size-4 text-primary" /> {layout === "ledger" ? "Transaction ledger spreadsheet" : "Recent transactions"}
            {ledger && ledger.transactions.length > 0 && (
              <span className="text-xs font-normal text-muted-foreground">
                · showing latest {Math.min(5, ledger.transactions.length)} of {ledger.transactions.length}
              </span>
            )}
          </div>
          {ledger && ledger.transactions.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setAllOpen(true)}
              className="h-8 gap-1.5 font-semibold"
            >
              <FolderOpen className="size-4" /> View all transactions
            </Button>
          )}
        </div>
        {loading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded-lg bg-muted/40" />
            ))}
          </div>
        ) : !ledger || ledger.transactions.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 py-10 text-center">
            <span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
              <Banknote className="size-5" />
            </span>
            <p className="mt-3 text-sm font-medium">No transactions yet</p>
            <p className="mt-1 max-w-xs text-xs text-muted-foreground">
              Record a buy, sell or a cash deposit — every movement is logged here and adjusts your balances.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-border/50">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 bg-background/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Type</th>
                  <th className="px-4 py-2.5 font-medium">Asset</th>
                  <th className="px-4 py-2.5 text-right font-medium">Qty × Price</th>
                  <th className="px-4 py-2.5 text-right font-medium">Fees</th>
                  <th className="px-4 py-2.5 text-right font-medium">FX</th>
                  <th className="px-4 py-2.5 text-right font-medium">Cash impact</th>
                  <th className="px-4 py-2.5 text-right font-medium">Realised</th>
                  <th className="px-4 py-2.5 text-right font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {ledger.transactions.slice(0, 5).map((t) => {
                  const meta = TYPE_META[t.type];
                  const Icon = meta.icon;
                  const cur = (t.currency as CurrencyCode) || NZD;
                  const isTrade = t.type === "buy" || t.type === "sell";
                  const total = rowCash(t);
                  return (
                    <tr key={t._id} className="border-b border-border/30 last:border-0 hover:bg-background/40">
                      <td className="px-4 py-2.5">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-semibold",
                            meta.cls
                          )}
                        >
                          <Icon className="size-3" /> {meta.label}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        {isTrade ? (
                          <div className="min-w-0">
                            <p className="font-semibold">{t.ticker}</p>
                            <p className="truncate text-xs text-muted-foreground">{t.asset_name || "—"}</p>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">{t.asset_name || "Cash"}</span>
                        )}
                      </td>
                      <td className="tnum px-4 py-2.5 text-right text-muted-foreground">
                        {isTrade ? `${formatNumber(t.quantity || 0)} × ${formatUnitPrice(t.price || 0, cur)}` : "—"}
                      </td>
                      <td className="tnum px-4 py-2.5 text-right text-muted-foreground">
                        {formatMoney(feeAmount(t), cur)}
                      </td>
                      <td className="tnum px-4 py-2.5 text-right text-muted-foreground">{savedFxLabel(t)}</td>
                      <td
                        className={cn(
                          "tnum px-4 py-2.5 text-right font-medium",
                          total >= 0 ? "text-emerald-600" : "text-rose-600"
                        )}
                      >
                        {formatSignedMoney(total, NZD)}
                      </td>
                      <td className="tnum px-4 py-2.5 text-right">
                        {t.type === "sell" && typeof t.realized_pnl === "number" ? (
                          <span className={t.realized_pnl >= 0 ? "text-emerald-600" : "text-rose-600"}>
                            {t.realized_pnl >= 0 ? "+" : ""}
                            {formatMoney(t.realized_pnl, NZD)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="tnum px-4 py-2.5 text-right text-xs text-muted-foreground">
                        {formatDisplayDate(t.executed_at || t.createdAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 px-1 text-[11px] text-muted-foreground">
          Every transaction is recorded with fees and automatically adjusts your cash balance. Sells book realised
          P&amp;L against your average cost. A dividend adds cash. A tax line reduces cash. Neither changes a holding quantity.
        </p>
        {layout === "ledger" && (
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <CashLineSection
              title="Dividends"
              empty="No dividends recorded."
              rows={(ledger?.transactions ?? []).filter((row) => row.type === "dividend")}
            />
            <CashLineSection
              title="Tax"
              empty="No tax lines recorded."
              rows={(ledger?.transactions ?? []).filter((row) => row.type === "tax")}
            />
          </div>
        )}
      </div>

      <AllTransactionsDialog
        open={allOpen}
        onOpenChange={setAllOpen}
        transactions={ledger?.transactions ?? []}
      />
    </div>
    </>
  );
}

/* ------------------------------------------ full-history "sub-folder" modal */

type TxSortKey = "date" | "type" | "ticker" | "quantity" | "price" | "total" | "realized";
const PAGE_SIZE = 12;

/**
 * Large, spacious "sub-folder" view of the COMPLETE transaction history.
 * Sortable + searchable + type-filtered, paginated for long ledgers, with a
 * one-click CSV export. Closes on ESC (Radix Dialog default) or the X button.
 */
function AllTransactionsDialog({
  open,
  onOpenChange,
  transactions,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  transactions: TransactionRow[];
}) {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | TxType>("all");
  const [sortKey, setSortKey] = useState<TxSortKey>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(0);

  // Reset paging/search whenever the modal (re)opens.
  useEffect(() => {
    if (open) {
      setPage(0);
      setQuery("");
      setTypeFilter("all");
      setSortKey("date");
      setSortDir("desc");
    }
  }, [open]);

  function toggleSort(key: TxSortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "type" || key === "ticker" ? "asc" : "desc");
    }
    setPage(0);
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows = transactions;
    if (typeFilter !== "all") rows = rows.filter((t) => t.type === typeFilter);
    if (q) {
      rows = rows.filter(
        (t) =>
          (t.ticker || "").toLowerCase().includes(q) ||
          (t.asset_name || "").toLowerCase().includes(q) ||
          (t.notes || "").toLowerCase().includes(q) ||
          t.type.toLowerCase().includes(q)
      );
    }
    const dir = sortDir === "asc" ? 1 : -1;
    const val = (t: TransactionRow): number | string => {
      switch (sortKey) {
        case "date":
          return new Date(t.executed_at || t.createdAt || 0).getTime();
        case "type":
          return t.type;
        case "ticker":
          return (t.ticker || t.asset_name || "").toLowerCase();
        case "quantity":
          return t.quantity ?? 0;
        case "price":
          return t.price ?? 0;
        case "total":
          return t.total ?? 0;
        case "realized":
          return t.realized_pnl ?? 0;
      }
    };
    return [...rows].sort((a, b) => {
      const av = val(a);
      const bv = val(b);
      if (typeof av === "string" && typeof bv === "string") return av.localeCompare(bv) * dir;
      return ((av as number) - (bv as number)) * dir;
    });
  }, [transactions, query, typeFilter, sortKey, sortDir]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  // Server builds the file and refuses Free. The browser does not assemble the CSV.
  async function exportCsv() {
    const res = await fetch("/api/transactions/export", { credentials: "include" });
    if (res.status === 403) {
      toast.error("CSV export is included on Starter and above.");
      return;
    }
    if (!res.ok) {
      toast.error("Could not export transactions.");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transactions-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success("Exported transactions to CSV");
  }

  const SortHead = ({ label, k, align = "right" }: { label: string; k: TxSortKey; align?: "left" | "right" }) => (
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

  const FILTERS: { key: "all" | TxType; label: string }[] = [
    { key: "all", label: "All" },
    { key: "buy", label: "Buys" },
    { key: "sell", label: "Sells" },
    { key: "deposit", label: "Deposits" },
    { key: "withdraw", label: "Withdrawals" },
    { key: "dividend", label: "Dividends" },
    { key: "tax", label: "Tax" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex h-[90vh] max-h-[90vh] w-[95vw] max-w-[95vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-[90vw]"
      >
        {/* Header */}
        <DialogHeader className="flex-row items-center justify-between space-y-0 border-b border-border/60 px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-primary/12 text-primary">
              <FolderOpen className="size-5" />
            </span>
            <div>
              <DialogTitle className="font-display text-xl">All transactions</DialogTitle>
              <DialogDescription>
                Your complete ledger — search, sort, filter and export the full history.
              </DialogDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={exportCsv} className="gap-1.5 font-semibold">
              <Download className="size-4" /> Export CSV
            </Button>
            <button
              onClick={() => onOpenChange(false)}
              className="grid size-9 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive"
              aria-label="Close"
            >
              <X className="size-5" />
            </button>
          </div>
        </DialogHeader>

        {/* Toolbar: search + type filters */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-6 py-3">
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search ticker, asset or notes…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(0);
              }}
              className="pl-9"
            />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {FILTERS.map((f) => {
              const active = typeFilter === f.key;
              return (
                <button
                  key={f.key}
                  onClick={() => {
                    setTypeFilter(f.key);
                    setPage(0);
                  }}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors",
                    active
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border/60 bg-background/40 text-muted-foreground hover:text-foreground"
                  )}
                >
                  {f.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Table — scrolls on BOTH axes so wide rows never push the modal sideways on mobile */}
        <div className="flex-1 overflow-auto px-6 py-2">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-card">
              <tr className="border-b border-border/60">
                <th className="py-2.5 pr-3 text-left"><SortHead label="Type" k="type" align="left" /></th>
                <th className="py-2.5 pr-3 text-left"><SortHead label="Asset" k="ticker" align="left" /></th>
                <th className="py-2.5 px-3"><SortHead label="Qty" k="quantity" /></th>
                <th className="py-2.5 px-3"><SortHead label="Price" k="price" /></th>
                <th className="py-2.5 px-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">FX</th>
                <th className="py-2.5 px-3"><SortHead label="Cash impact" k="total" /></th>
                <th className="hidden py-2.5 px-3 md:table-cell"><SortHead label="Realised" k="realized" /></th>
                <th className="py-2.5 pl-3"><SortHead label="Date" k="date" /></th>
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-sm text-muted-foreground">
                    No transactions match your filters.
                  </td>
                </tr>
              ) : (
                pageRows.map((t) => {
                  const meta = TYPE_META[t.type];
                  const Icon = meta.icon;
                  const cur = (t.currency as CurrencyCode) || NZD;
                  const isTrade = t.type === "buy" || t.type === "sell";
                  const total = rowCash(t);
                  return (
                    <tr key={t._id} className="border-b border-border/30 last:border-0 hover:bg-background/40">
                      <td className="py-3 pr-3">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-semibold",
                            meta.cls
                          )}
                        >
                          <Icon className="size-3" /> {meta.label}
                        </span>
                      </td>
                      <td className="py-3 pr-3">
                        {isTrade ? (
                          <div className="min-w-0">
                            <p className="font-semibold">{t.ticker}</p>
                            <p className="max-w-[14rem] truncate text-xs text-muted-foreground">
                              {t.asset_name || "—"}
                            </p>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">{t.asset_name || "Cash"}</span>
                        )}
                      </td>
                      <td className="tnum py-3 px-3 text-right text-muted-foreground">
                        {isTrade ? formatNumber(t.quantity || 0) : "—"}
                      </td>
                      <td className="tnum py-3 px-3 text-right text-muted-foreground">
                        {isTrade ? formatUnitPrice(t.price || 0, cur) : "—"}
                      </td>
                      <td className="tnum py-3 px-3 text-right text-muted-foreground">{savedFxLabel(t)}</td>
                      <td
                        className={cn(
                          "tnum py-3 px-3 text-right font-medium",
                          total >= 0 ? "text-emerald-600" : "text-rose-600"
                        )}
                      >
                        {formatSignedMoney(total, NZD)}
                      </td>
                      <td className="tnum hidden py-3 px-3 text-right md:table-cell">
                        {t.type === "sell" && typeof t.realized_pnl === "number" ? (
                          <span className={t.realized_pnl >= 0 ? "text-emerald-600" : "text-rose-600"}>
                            {t.realized_pnl >= 0 ? "+" : ""}
                            {formatMoney(t.realized_pnl, NZD)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="tnum py-3 pl-3 text-right text-xs text-muted-foreground">
                        {formatDisplayDate(t.executed_at || t.createdAt)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer: count + pagination */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 px-6 py-3">
          <p className="text-xs text-muted-foreground">
            {filtered.length} transaction{filtered.length === 1 ? "" : "s"}
            {typeFilter !== "all" || query ? " (filtered)" : ""}
          </p>
          {pageCount > 1 && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0"
                disabled={safePage === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                aria-label="Previous page"
              >
                <ChevronLeft className="size-4" />
              </Button>
              <span className="tnum text-xs text-muted-foreground">
                Page {safePage + 1} of {pageCount}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0"
                disabled={safePage >= pageCount - 1}
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                aria-label="Next page"
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export { TransactionDialog } from "@/components/dashboard/TransactionDialog";
