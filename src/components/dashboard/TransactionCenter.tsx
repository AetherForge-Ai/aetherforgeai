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
import { formatMoney, currencyForTicker, type CurrencyCode } from "@/lib/currency";
import { formatNumber, type Stock } from "@/lib/portfolio";
import { lookupTicker } from "@/lib/market";
import { CRYPTO_DIRECTORY } from "@/lib/apex";
import { TickerSearch } from "@/components/dashboard/TickerSearch";
import { cn } from "@/lib/utils";
import { keepDialogOpenOnPortalInteraction, keepDialogOpenWhilePopoverOpen } from "@/lib/dialog-guards";
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

type TxType = "buy" | "sell" | "deposit" | "withdraw";
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
  total?: number;
  realized_pnl?: number;
  currency?: string;
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

/** Local yyyy-mm-dd for "today" — the boundary that flips the live-price lock on/off. */
function todayISO(): string {
  const d = new Date();
  // Use local date parts so "today" matches the user's calendar, not UTC.
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 10);
}

function fmtDateTime(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "2-digit" });
}

const TYPE_META: Record<TxType, { label: string; icon: React.ElementType; cls: string }> = {
  buy: { label: "Buy", icon: Plus, cls: "bg-emerald-500/15 text-emerald-600" },
  sell: { label: "Sell", icon: Minus, cls: "bg-rose-500/15 text-rose-600" },
  deposit: { label: "Deposit", icon: ArrowDownToLine, cls: "bg-sky-500/15 text-sky-600" },
  withdraw: { label: "Withdraw", icon: ArrowUpFromLine, cls: "bg-amber-500/15 text-amber-600" },
};

/** A KPI tile matching the dashboard's card language. */
function CashCard({
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

/** Holding that may originate from the dedicated precious_metal table. */
type SellableHolding = Stock & { metalSourceId?: string };

export function TransactionCenter({
  holdings,
  onChanged,
  reloadSignal,
  preview = false,
}: {
  /** Current holdings (both bots + precious metals) — used to power the Sell picker. */
  holdings: SellableHolding[];
  /** Called after any trade so the parent can reload holdings + prices. */
  onChanged: () => void;
  /** Increment to force a ledger reload (e.g. after a metals buy/sell elsewhere). */
  reloadSignal?: number;
  /** Guest preview — read-only, no network calls. */
  preview?: boolean;
}) {
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [loading, setLoading] = useState(!preview);
  const [open, setOpen] = useState(false);
  const [allOpen, setAllOpen] = useState(false);
  const [mode, setMode] = useState<TxType>("buy");

  const load = useCallback(async () => {
    if (preview) return; // guest preview: no live ledger fetch
    setLoading(true);
    const res = await api.get<Ledger>("/api/transactions");
    if (res.ok && res.data) {
      setLedger(res.data);
    } else {
      console.error("[transaction-center] Failed to load ledger:", res.error);
    }
    setLoading(false);
  }, [preview]);

  useEffect(() => {
    load();
  }, [load, reloadSignal]);

  function openMode(m: TxType) {
    setMode(m);
    setOpen(true);
  }

  // After a successful transaction: refresh the ledger and the parent holdings.
  const handleDone = useCallback(
    (updated: Ledger) => {
      setLedger(updated);
      onChanged();
    },
    [onChanged]
  );

  const cash = ledger?.cashBalance ?? 0;
  const realizedYtd = ledger?.realizedYtd ?? 0;
  const realizedTotal = ledger?.realizedTotal ?? 0;

  return (
    <div className="rounded-3xl border border-border/70 bg-card/50">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-6 py-4">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-lg bg-primary/12 text-primary">
            <ArrowLeftRight className="size-4" />
          </span>
          <div>
            <h2 className="font-display text-lg font-bold">Transaction Center</h2>
            <p className="text-xs text-muted-foreground">
              Record every movement — trades adjust holdings & cash automatically
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => openMode("buy")} className="font-semibold shadow-glow">
            <Plus className="mr-1.5 size-4" /> Buy / Add
          </Button>
          <Button size="sm" variant="outline" onClick={() => openMode("sell")} className="font-semibold">
            <Minus className="mr-1.5 size-4" /> Sell / Remove
          </Button>
          <Button size="sm" variant="ghost" onClick={() => openMode("deposit")}>
            <ArrowDownToLine className="mr-1.5 size-4" /> Add funds
          </Button>
          <Button size="sm" variant="ghost" onClick={() => openMode("withdraw")}>
            <ArrowUpFromLine className="mr-1.5 size-4" /> Withdraw
          </Button>
        </div>
      </div>

      {/* Cash + realized KPIs */}
      <div className="grid gap-4 p-6 sm:grid-cols-3">
        <CashCard
          label="Cash balance · NZD"
          value={formatMoney(cash, NZD)}
          sub="Available to invest"
          icon={Wallet}
        />
        <CashCard
          label="Realized P&L · YTD"
          value={formatMoney(realizedYtd, NZD)}
          sub={
            ledger?.realizedYtdCount
              ? `From ${ledger.realizedYtdCount} closed sale${ledger.realizedYtdCount === 1 ? "" : "s"}`
              : "No closed sales yet this year"
          }
          icon={realizedYtd >= 0 ? TrendingUp : TrendingDown}
          tone={realizedYtd > 0 ? "up" : realizedYtd < 0 ? "down" : "neutral"}
        />
        <CashCard
          label="Realized P&L · All-time"
          value={formatMoney(realizedTotal, NZD)}
          sub="Across every closed position"
          icon={PiggyBank}
          tone={realizedTotal > 0 ? "up" : realizedTotal < 0 ? "down" : "neutral"}
        />
      </div>

      {/* Recent ledger — compact 5-row summary; full history lives in the modal */}
      <div className="px-6 pb-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Receipt className="size-4 text-primary" /> Recent transactions
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
                  <th className="px-4 py-2.5 text-right font-medium">Cash impact</th>
                  <th className="px-4 py-2.5 text-right font-medium">Realized</th>
                  <th className="px-4 py-2.5 text-right font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {ledger.transactions.slice(0, 5).map((t) => {
                  const meta = TYPE_META[t.type];
                  const Icon = meta.icon;
                  const cur = (t.currency as CurrencyCode) || NZD;
                  const isTrade = t.type === "buy" || t.type === "sell";
                  const total = t.total ?? 0;
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
                        {isTrade ? `${formatNumber(t.quantity || 0)} × ${formatMoney(t.price || 0, cur)}` : "—"}
                      </td>
                      <td className="tnum px-4 py-2.5 text-right text-muted-foreground">
                        {isTrade && t.fees ? formatMoney(t.fees, cur) : "—"}
                      </td>
                      <td
                        className={cn(
                          "tnum px-4 py-2.5 text-right font-medium",
                          total >= 0 ? "text-emerald-600" : "text-rose-600"
                        )}
                      >
                        {total >= 0 ? "+" : ""}
                        {formatMoney(total, NZD)}
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
                        {fmtDateTime(t.executed_at || t.createdAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 px-1 text-[11px] text-muted-foreground">
          Every transaction is recorded with fees and automatically adjusts your cash balance. Sells book realized
          P&amp;L against your average cost.
        </p>
      </div>

      <TransactionDialog
        open={open}
        onOpenChange={setOpen}
        mode={mode}
        holdings={holdings}
        cash={cash}
        onDone={handleDone}
      />

      <AllTransactionsDialog
        open={allOpen}
        onOpenChange={setAllOpen}
        transactions={ledger?.transactions ?? []}
      />
    </div>
  );
}

/* ------------------------------------------ full-history "sub-folder" modal */

type TxSortKey = "date" | "type" | "ticker" | "quantity" | "price" | "total" | "realized";
const PAGE_SIZE = 12;

/** Full ISO → yyyy-mm-dd for CSV, and a display date/time helper. */
function csvDate(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

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

  // Build + download a CSV of the CURRENT filtered/sorted view.
  function exportCsv() {
    const headers = [
      "Date",
      "Type",
      "Ticker",
      "Asset name",
      "Asset type",
      "Quantity",
      "Price",
      "Fees",
      "Cash impact",
      "Realized P&L",
      "Currency",
      "Notes",
    ];
    const esc = (v: unknown) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = filtered.map((t) =>
      [
        csvDate(t.executed_at || t.createdAt),
        t.type,
        t.ticker || "",
        t.asset_name || "",
        t.asset_type || "",
        t.quantity ?? "",
        t.price ?? "",
        t.fees ?? "",
        t.total ?? "",
        t.realized_pnl ?? "",
        t.currency || "NZD",
        t.notes || "",
      ]
        .map(esc)
        .join(",")
    );
    const csv = [headers.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transactions-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    console.log(`[transaction-center] Exported ${filtered.length} transactions to CSV`);
    toast.success(`Exported ${filtered.length} transaction${filtered.length === 1 ? "" : "s"} to CSV`);
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
                <th className="py-2.5 px-3"><SortHead label="Cash impact" k="total" /></th>
                <th className="hidden py-2.5 px-3 md:table-cell"><SortHead label="Realized" k="realized" /></th>
                <th className="py-2.5 pl-3"><SortHead label="Date" k="date" /></th>
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-sm text-muted-foreground">
                    No transactions match your filters.
                  </td>
                </tr>
              ) : (
                pageRows.map((t) => {
                  const meta = TYPE_META[t.type];
                  const Icon = meta.icon;
                  const cur = (t.currency as CurrencyCode) || NZD;
                  const isTrade = t.type === "buy" || t.type === "sell";
                  const total = t.total ?? 0;
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
                        {isTrade ? formatMoney(t.price || 0, cur) : "—"}
                      </td>
                      <td
                        className={cn(
                          "tnum py-3 px-3 text-right font-medium",
                          total >= 0 ? "text-emerald-600" : "text-rose-600"
                        )}
                      >
                        {total >= 0 ? "+" : ""}
                        {formatMoney(total, NZD)}
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
                        {fmtDateTime(t.executed_at || t.createdAt)}
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

/* ------------------------------------------------------------------ dialog */

function TransactionDialog({
  open,
  onOpenChange,
  mode,
  holdings,
  cash,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  mode: TxType;
  holdings: SellableHolding[];
  cash: number;
  onDone: (ledger: Ledger) => void;
}) {
  const isTrade = mode === "buy" || mode === "sell";
  const todayStr = useMemo(() => todayISO(), []);
  const [assetType, setAssetType] = useState<AssetType>("stock");
  const [ticker, setTicker] = useState("");
  const [assetName, setAssetName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [fees, setFees] = useState("");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  // BUY: the transaction date drives the price logic — today ⇒ live price locked;
  // any past date ⇒ the price field stays fully editable for the amount actually paid.
  const [executedDate, setExecutedDate] = useState(todayStr);
  const [priceLoading, setPriceLoading] = useState(false);
  // True when the date is today but no live price could be fetched (market closed /
  // invalid ticker / provider down) — we then UNLOCK the field for manual entry.
  const [liveUnavailable, setLiveUnavailable] = useState(false);

  const isToday = executedDate === todayStr;
  const isMetal = assetType === "metal";
  // Which Buy asset-class chip is active (metals are keyed by their ticker).
  const selectedAssetKey = isMetal ? ticker.toLowerCase() : assetType;
  // Lock the Share Price to the live market price only for a BUY dated today AND
  // when a live quote is actually available. Otherwise the field stays editable so
  // the user is never blocked (past dates, or a today with no live quote).
  const priceLocked = mode === "buy" && isToday && !liveUnavailable;

  // Keep the latest ticker in a ref so the date handler always fetches for the
  // current selection without re-creating callbacks.
  const tickerRef = useRef(ticker);
  tickerRef.current = ticker;

  // Reset the form whenever the dialog (re)opens for a given mode.
  useEffect(() => {
    if (open) {
      setAssetType("stock");
      setTicker("");
      setAssetName("");
      setQuantity("");
      setPrice("");
      setFees("");
      setAmount("");
      setNotes("");
      // New buy defaults to today ⇒ the price locks to live once a ticker is chosen.
      setExecutedDate(todayStr);
      setPriceLoading(false);
      setLiveUnavailable(false);
    }
  }, [open, mode, todayStr]);

  // Sell mode: the holding currently selected in the picker (for max qty + prefill).
  // Prefer exact _id match when available so multiple GOLD/SILVER lots can be distinguished.
  const selectedHolding = useMemo(() => {
    if (mode !== "sell") return null;
    const byId = holdings.find((h) => h._id === ticker || h.metalSourceId === ticker);
    if (byId) return byId;
    return holdings.find((h) => h.ticker.toUpperCase() === ticker.trim().toUpperCase()) || null;
  }, [mode, holdings, ticker]);

  // When a sell target is chosen, prefill current price, asset name and quantity.
  // Precious-metal holdings default to full quantity; the user can lower it for a partial sell.
  function chooseHolding(h: SellableHolding) {
    setTicker(h.metalSourceId || h.ticker); // use metalSourceId as the key when present
    setAssetType((h.asset_type as AssetType) || "stock");
    setAssetName(h.company_name || h.ticker);
    setPrice(h.current_price ? String(h.current_price) : "");
    // Pre-fill full quantity for metals — user can reduce it for a partial sale.
    if (h.asset_type === "metal" || h.metalSourceId) {
      setQuantity(String(h.shares || 0));
    }
  }

  function handleBuyTickerBlur() {
    if (mode !== "buy") return;
    const t = ticker.trim().toUpperCase();
    if (!t) return;
    if (assetType === "crypto") {
      const coin = CRYPTO_DIRECTORY.find((c) => c.ticker === t);
      if (coin && !assetName) setAssetName(coin.name);
      // Crypto ticker typed by hand — lock to today's live price if the date is today.
      if (isToday) void lockToLivePrice(t, "crypto");
    } else {
      const info = lookupTicker(t);
      if (info && !assetName) setAssetName(info.name);
    }
  }

  /**
   * Pick a Buy asset class. Stocks/crypto just switch the class; Gold & Silver
   * additionally pin the ticker (GOLD/SILVER) and lock to today's live NZD spot,
   * since a metal's symbol is fixed. Clears any half-entered ticker on switch.
   */
  function chooseBuyAsset(opt: (typeof BUY_ASSETS)[number]) {
    setAssetType(opt.assetType);
    setLiveUnavailable(false);
    if (opt.assetType === "metal" && opt.ticker) {
      setTicker(opt.ticker);
      setAssetName(opt.name || "");
      if (isToday) void lockToLivePrice(opt.ticker, "metal");
      else setPrice("");
    } else {
      // Switching to stock/crypto — reset the fixed metal selection.
      setTicker("");
      setAssetName("");
      setPrice("");
    }
  }

  /** Fetch the live price for a symbol via the shared quote endpoint (null if none). */
  async function fetchLivePrice(sym: string, type: AssetType): Promise<number | null> {
    const res = await api.get<{ price: number | null }>(
      `/api/tickers/quote?symbol=${encodeURIComponent(sym)}&type=${type}`
    );
    return res.ok && res.data?.price && res.data.price > 0 ? res.data.price : null;
  }

  /** Lock the Share Price field to today's live price (or unlock for manual entry). */
  async function lockToLivePrice(sym: string, type: AssetType) {
    setPriceLoading(true);
    setLiveUnavailable(false);
    const live = await fetchLivePrice(sym, type);
    setPriceLoading(false);
    if (live != null) {
      setPrice(String(live));
      setLiveUnavailable(false);
      console.log(`[transaction-center] Locked ${sym} to today's live price: ${live}`);
    } else {
      // Edge case — market closed / invalid ticker / provider outage. Never block the
      // user: unlock the field so they can type the price manually.
      setLiveUnavailable(true);
      console.warn(`[transaction-center] No live price for ${sym} today — unlocking for manual entry.`);
    }
  }

  // Changing the date flips the price behaviour on the fly (BUY only).
  function handleDateChange(v: string) {
    setExecutedDate(v);
    const sym = tickerRef.current.trim().toUpperCase();
    const nowToday = v === todayStr;
    if (!sym) {
      // No ticker yet — the price logic applies once one is chosen.
      setLiveUnavailable(false);
      return;
    }
    if (nowToday) {
      void lockToLivePrice(sym, assetType);
    } else {
      // Past date → unlock and let the user type the exact historical price.
      setLiveUnavailable(false);
    }
  }

  const currency: CurrencyCode = isTrade
    ? currencyForTicker(ticker || "", assetType)
    : NZD;

  // Live estimate of the cash impact so the user sees it before confirming.
  const estimate = useMemo(() => {
    const q = Number(quantity) || 0;
    const p = Number(price) || 0;
    const f = Number(fees) || 0;
    if (mode === "buy") return -(q * p + f);
    if (mode === "sell") return q * p - f;
    if (mode === "deposit") return Number(amount) || 0;
    return -(Number(amount) || 0);
  }, [mode, quantity, price, fees, amount]);

  async function submit() {
    // Client-side validation with clear messages.
    if (isTrade) {
      const t = ticker.trim().toUpperCase();
      const q = Number(quantity);
      const p = Number(price);
      if (mode === "buy") {
        if (!executedDate) return toast.error("Date is required");
        if (executedDate > todayStr) return toast.error("Date can't be in the future");
      }
      if (!t && !(selectedHolding?.metalSourceId)) return toast.error("Ticker is required");
      if (!(q > 0)) return toast.error("Quantity must be greater than 0");
      if (!(p > 0) && !(selectedHolding?.metalSourceId)) return toast.error("Price must be greater than 0");
      if (mode === "sell") {
        if (!selectedHolding) return toast.error("Select a holding you own to sell");
        if (q > (selectedHolding.shares || 0) + 1e-6) {
          return toast.error(`You only hold ${formatNumber(selectedHolding.shares || 0)} of ${selectedHolding.ticker}`);
        }
      }
    } else {
      const a = Number(amount);
      if (!(a > 0)) return toast.error("Amount must be greater than 0");
      if (mode === "withdraw" && a > cash + 1e-6) return toast.error("Insufficient cash balance");
    }

    setSaving(true);

    // ── Precious-metal sell (from the dedicated precious_metal table) ──────
    // Supports full or partial sales at today's live NZD spot.
    //   DELETE /api/metals/[id]?ounces=X  → sell X oz (omit ounces for full sell)
    // Cash, realized P&L and the ledger stay in sync with the metals section.
    if (mode === "sell" && selectedHolding?.metalSourceId) {
      const metalId = selectedHolding.metalSourceId;
      const sellQty = Number(quantity);
      const held = selectedHolding.shares || 0;
      if (!(sellQty > 0)) {
        setSaving(false);
        return toast.error("Quantity must be greater than 0");
      }
      if (sellQty > held + 1e-6) {
        setSaving(false);
        return toast.error(`You only hold ${formatNumber(held)} oz of ${selectedHolding.ticker}`);
      }

      // Pass ounces so the API can do a partial sell when qty < held.
      const url = `/api/metals/${metalId}?ounces=${encodeURIComponent(String(sellQty))}`;
      console.log(
        `[transaction-center] Selling ${sellQty} oz ${selectedHolding.ticker} (held ${held}) via ${url}`
      );
      const res = await api.delete<{
        cashBalance: number;
        realizedNZD?: number;
        proceeds?: number;
        pricePerOzNZD?: number;
        soldOunces?: number;
        remainingOunces?: number;
        partial?: boolean;
      }>(url);
      setSaving(false);

      if (res.ok) {
        const sold = res.data?.soldOunces ?? sellQty;
        const remaining = res.data?.remainingOunces ?? 0;
        const proceeds = res.data?.proceeds;
        const partial = res.data?.partial ?? sold < held - 1e-6;
        toast.success(
          proceeds != null
            ? `${partial ? "Partially sold" : "Sold"} ${formatNumber(sold)} oz ${selectedHolding.ticker} · ${formatMoney(proceeds, "NZD")}${
                remaining > 0 ? ` · ${formatNumber(remaining)} oz remaining` : ""
              }`
            : `Sold ${formatNumber(sold)} oz ${selectedHolding.ticker}`
        );
        onOpenChange(false);
        // Reload ledger so cash + realized cards update.
        const ledgerRes = await api.get<Ledger>("/api/transactions");
        if (ledgerRes.ok && ledgerRes.data) {
          onDone(ledgerRes.data);
        } else {
          // Fallback: still notify parent so holdings refresh.
          onDone({
            transactions: [],
            cashBalance: res.data?.cashBalance ?? cash,
            realizedYtd: 0,
            realizedTotal: 0,
            realizedYtdCount: 0,
          });
        }
      } else {
        console.error("[transaction-center] Metal sell failed:", res.error);
        toast.error(typeof res.error === "string" ? res.error : "Could not sell metal holding.");
      }
      return;
    }

    // ── Normal buy / sell / deposit / withdraw ────────────────────────────
    const payload: Record<string, unknown> = { type: mode, notes: notes.trim() || undefined };
    if (isTrade) {
      payload.ticker = (selectedHolding?.ticker || ticker).trim().toUpperCase();
      payload.asset_type = assetType;
      payload.asset_name = assetName.trim() || undefined;
      payload.quantity = Number(quantity);
      payload.price = Number(price);
      if (Number(fees) > 0) payload.fees = Number(fees);
      // Record the chosen transaction date (buy). yyyy-mm-dd → server stores as Date.
      if (mode === "buy" && executedDate) payload.executed_at = executedDate;
    } else {
      payload.amount = Number(amount);
    }

    console.log(`[transaction-center] Submitting ${mode}`, payload);
    const res = await api.post<Ledger>("/api/transactions", payload);
    setSaving(false);

    if (res.ok && res.data) {
      const labels: Record<TxType, string> = {
        buy: "Purchase recorded",
        sell: "Sale recorded",
        deposit: "Funds added",
        withdraw: "Withdrawal recorded",
      };
      toast.success(labels[mode]);
      onOpenChange(false);
      onDone(res.data);
    } else {
      console.error("[transaction-center] Transaction failed:", res.error);
      toast.error(typeof res.error === "string" ? res.error : "Could not record transaction.");
    }
  }

  const titles: Record<TxType, string> = {
    buy: "Buy / Add a position",
    sell: "Sell / Remove a position",
    deposit: "Add funds to cash",
    withdraw: "Withdraw cash",
  };
  const descriptions: Record<TxType, string> = {
    buy: "Buying debits your cash balance and re-averages your cost basis.",
    sell: "Selling credits your cash and books realized P&L against your average cost.",
    deposit: "Add investable cash to your account (NZD).",
    withdraw: "Withdraw available cash from your account (NZD).",
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-md"
        // The Buy/Sell form nests a Popover-based ticker search (and a native
        // date picker) whose dropdowns render in a portal OUTSIDE this dialog's
        // DOM subtree. Without these guards, clicking a search result — or the
        // cmdk item unmounting on select — is misread by Radix as an "outside"
        // click and dismisses the whole dialog.
        onInteractOutside={keepDialogOpenOnPortalInteraction}
        onEscapeKeyDown={keepDialogOpenWhilePopoverOpen}
      >
        <DialogHeader>
          <DialogTitle className="font-display text-xl">{titles[mode]}</DialogTitle>
          <DialogDescription>{descriptions[mode]}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* BUY: the transaction date is the FIRST thing entered — it governs the price */}
          {mode === "buy" && (
            <div className="space-y-2">
              <Label htmlFor="tx-date" className="flex items-center gap-1.5 font-semibold">
                <CalendarDays className="size-3.5 text-primary" /> Date
                <span className="text-destructive">*</span>
              </Label>
              <Input
                id="tx-date"
                type="date"
                max={todayStr}
                value={executedDate}
                onChange={(e) => handleDateChange(e.target.value)}
                className="font-medium"
              />
              <p className="flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground">
                <Info className="mt-0.5 size-3 shrink-0" />
                {isToday
                  ? "Today selected — the share price below locks to the live market price automatically."
                  : "Past date — enter the exact price you paid below. Pick today to auto-fill the live price."}
              </p>
            </div>
          )}

          {/* BUY: asset class + free ticker input */}
          {mode === "buy" && (
            <>
              <div className="space-y-2">
                <Label>Asset class</Label>
                <div className="grid grid-cols-2 gap-2">
                  {BUY_ASSETS.map((opt) => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => chooseBuyAsset(opt)}
                      className={cn(
                        "rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                        selectedAssetKey === opt.key
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border/60 text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="tx-ticker">
                  {isMetal ? "Metal" : "Company / Ticker"}
                </Label>
                {isMetal ? (
                  <div className="flex items-center justify-between rounded-lg border border-primary/40 bg-primary/5 px-3 py-2.5">
                    <span className="flex items-center gap-2 text-sm font-semibold">
                      <span>{ticker === "GOLD" ? "🥇" : "🥈"}</span>
                      {assetName || (ticker === "GOLD" ? "Gold bullion" : "Silver bullion")}
                    </span>
                    <span className="text-xs text-muted-foreground">Live NZD spot / troy oz</span>
                  </div>
                ) : assetType === "crypto" ? (
                  <>
                    <Input
                      id="tx-ticker"
                      list="tx-ticker-suggestions"
                      placeholder="e.g. BTC, ETH, SOL"
                      value={ticker}
                      onChange={(e) => setTicker(e.target.value.toUpperCase())}
                      onBlur={handleBuyTickerBlur}
                      className="uppercase"
                    />
                    <datalist id="tx-ticker-suggestions">
                      {CRYPTO_DIRECTORY.map((t) => (
                        <option key={t.ticker} value={t.ticker}>
                          {t.name}
                        </option>
                      ))}
                    </datalist>
                  </>
                ) : (
                  <>
                    <TickerSearch
                      value={ticker}
                      label={assetName}
                      onSelect={(m) => {
                        const sym = m.symbol.toUpperCase();
                        setTicker(sym);
                        setAssetName(m.name);
                        // Today's date ⇒ immediately lock the price to the live quote.
                        if (isToday) void lockToLivePrice(sym, "stock");
                      }}
                    />
                    <p className="text-xs text-muted-foreground">
                      Every ASX, NZX, NASDAQ &amp; NYSE company — search by name or ticker.
                    </p>
                  </>
                )}
              </div>
            </>
          )}

          {/* SELL: pick from owned holdings (stocks, crypto AND gold/silver) */}
          {mode === "sell" && (
            <div className="space-y-2">
              <Label>Holding to sell</Label>
              {holdings.length === 0 ? (
                <p className="rounded-lg border border-border/60 bg-background/40 px-3 py-2.5 text-sm text-muted-foreground">
                  You have no holdings to sell yet.
                </p>
              ) : (
                <div className="max-h-40 space-y-1.5 overflow-y-auto pr-1">
                  {holdings.map((h) => {
                    const active = selectedHolding?._id === h._id;
                    const isMetalHolding = h.asset_type === "metal" || !!h.metalSourceId;
                    const unit = isMetalHolding ? "oz" : "";
                    const icon = h.ticker === "GOLD" ? "🥇" : h.ticker === "SILVER" ? "🥈" : null;
                    return (
                      <button
                        key={h._id}
                        type="button"
                        onClick={() => chooseHolding(h)}
                        className={cn(
                          "flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                          active
                            ? "border-primary bg-primary/10"
                            : "border-border/60 hover:border-primary/40 hover:bg-background/40"
                        )}
                      >
                        <span className="flex items-center gap-2">
                          {icon && <span>{icon}</span>}
                          <span className="font-semibold">{h.ticker}</span>
                          <span className="text-xs text-muted-foreground">{h.company_name || ""}</span>
                          {h.metalSourceId && (
                            <span className="rounded bg-[var(--gold)]/15 px-1.5 py-0.5 text-[0.65rem] font-medium text-[var(--gold)]">
                              Metal
                            </span>
                          )}
                        </span>
                        <span className="tnum text-xs text-muted-foreground">
                          {formatNumber(h.shares)}{unit ? ` ${unit}` : ""} @{" "}
                          {formatMoney(
                            h.current_price,
                            currencyForTicker(h.ticker, (h.asset_type as AssetType) || "stock")
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
              {selectedHolding?.metalSourceId && (
                <p className="flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground">
                  <Info className="mt-0.5 size-3 shrink-0" />
                  Sold at today&apos;s live NZD spot price. Lower the quantity below to sell only part of your holding — the rest stays in your metals portfolio.
                </p>
              )}
            </div>
          )}

          {/* Trade quantity / price / fees */}
          {isTrade && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="tx-qty">
                    {selectedHolding?.metalSourceId || (mode === "buy" && isMetal)
                      ? "Ounces"
                      : "Quantity"}
                  </Label>
                  <Input
                    id="tx-qty"
                    type="number"
                    min="0"
                    step="any"
                    placeholder={selectedHolding?.metalSourceId || isMetal ? "e.g. 2.5" : "10"}
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                  />
                  {mode === "sell" && selectedHolding && (
                    <button
                      type="button"
                      onClick={() => setQuantity(String(selectedHolding.shares || 0))}
                      className="text-[11px] font-medium text-primary hover:underline"
                    >
                      Sell all · {formatNumber(selectedHolding.shares || 0)}
                      {selectedHolding.metalSourceId || selectedHolding.asset_type === "metal"
                        ? " oz"
                        : ""}
                    </button>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tx-price" className="flex items-center gap-1.5">
                    Price / unit ({currency})
                    {priceLoading && <Loader2 className="size-3 animate-spin text-muted-foreground" />}
                    {priceLocked && !priceLoading && <Lock className="size-3 text-emerald-500" />}
                  </Label>
                  <div className="relative">
                    <Input
                      id="tx-price"
                      type="number"
                      min="0"
                      step="any"
                      placeholder={priceLoading ? "Fetching live price…" : "150.00"}
                      value={price}
                      disabled={priceLocked}
                      aria-readonly={priceLocked}
                      title={priceLocked ? "Locked to today's live market price" : undefined}
                      onChange={(e) => setPrice(e.target.value)}
                      className={cn(
                        priceLocked &&
                          "cursor-not-allowed border-emerald-500/40 bg-emerald-500/5 pr-8 text-emerald-700"
                      )}
                    />
                    {priceLocked && (
                      <Lock className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-emerald-500/70" />
                    )}
                  </div>
                </div>
              </div>

              {/* BUY: contextual explanation of why the price is (or isn't) locked */}
              {mode === "buy" &&
                (priceLocked ? (
                  <p className="-mt-1 flex items-start gap-1.5 text-xs leading-relaxed text-emerald-600">
                    <Lock className="mt-0.5 size-3.5 shrink-0" />
                    <span>
                      <strong>Locked to today&apos;s live price.</strong> Because the date is today, this is the
                      current market price and can&apos;t be edited. Pick an earlier date to enter the price you paid.
                    </span>
                  </p>
                ) : isToday && liveUnavailable ? (
                  <p className="-mt-1 flex items-start gap-1.5 text-xs leading-relaxed text-amber-600">
                    <Info className="mt-0.5 size-3.5 shrink-0" />
                    <span>
                      We couldn&apos;t fetch a live price right now (the market may be closed or the ticker is
                      unrecognised). Enter the price you paid manually.
                    </span>
                  </p>
                ) : null)}

              <div className="space-y-2">
                <Label htmlFor="tx-fees">Fees ({currency}) — optional</Label>
                <Input
                  id="tx-fees"
                  type="number"
                  min="0"
                  step="any"
                  placeholder="0.00"
                  value={fees}
                  onChange={(e) => setFees(e.target.value)}
                />
              </div>
            </>
          )}

          {/* Cash amount */}
          {!isTrade && (
            <div className="space-y-2">
              <Label htmlFor="tx-amount">Amount (NZD)</Label>
              <Input
                id="tx-amount"
                type="number"
                min="0"
                step="any"
                placeholder="1000.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              {mode === "withdraw" && (
                <p className="text-xs text-muted-foreground">
                  Available: <span className="tnum">{formatMoney(cash, NZD)}</span>
                </p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="tx-notes">Notes — optional</Label>
            <Input
              id="tx-notes"
              placeholder="e.g. Dollar-cost average, rebalance…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {/* Live cash-impact estimate */}
          <div className="flex items-center justify-between rounded-lg border border-border/60 bg-background/40 px-3 py-2.5 text-sm">
            <span className="text-muted-foreground">
              {mode === "buy" ? "Cash required" : mode === "sell" ? "Cash proceeds" : "Cash impact"}
              {isTrade && currency !== NZD ? ` (${currency})` : ""}
            </span>
            <span
              className={cn(
                "tnum font-semibold",
                estimate >= 0 ? "text-emerald-600" : "text-rose-600"
              )}
            >
              {estimate >= 0 ? "+" : ""}
              {formatMoney(estimate, currency)}
            </span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving || priceLoading} className="font-semibold">
            {saving ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" /> Recording…
              </>
            ) : (
              titles[mode].split(" ")[0]
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
