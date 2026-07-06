"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import { TICKER_DIRECTORY, lookupTicker } from "@/lib/market";
import { CRYPTO_DIRECTORY } from "@/lib/apex";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  ArrowLeftRight,
  Plus,
  Minus,
  Loader2,
  Wallet,
  PiggyBank,
  TrendingUp,
  TrendingDown,
  Banknote,
  Receipt,
  ArrowDownToLine,
  ArrowUpFromLine,
} from "lucide-react";

type TxType = "buy" | "sell" | "deposit" | "withdraw";
type AssetType = "stock" | "crypto";

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

function fmtDateTime(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "2-digit" });
}

const TYPE_META: Record<TxType, { label: string; icon: React.ElementType; cls: string }> = {
  buy: { label: "Buy", icon: Plus, cls: "bg-emerald-500/15 text-emerald-400" },
  sell: { label: "Sell", icon: Minus, cls: "bg-rose-500/15 text-rose-400" },
  deposit: { label: "Deposit", icon: ArrowDownToLine, cls: "bg-sky-500/15 text-sky-400" },
  withdraw: { label: "Withdraw", icon: ArrowUpFromLine, cls: "bg-amber-500/15 text-amber-400" },
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

export function TransactionCenter({
  holdings,
  onChanged,
}: {
  /** Current holdings (both bots) — used to power the Sell picker. */
  holdings: Stock[];
  /** Called after any trade so the parent can reload holdings + prices. */
  onChanged: () => void;
}) {
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<TxType>("buy");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await api.get<Ledger>("/api/transactions");
    if (res.ok && res.data) {
      setLedger(res.data);
    } else {
      console.error("[transaction-center] Failed to load ledger:", res.error);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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

      {/* Recent ledger */}
      <div className="px-6 pb-6">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Receipt className="size-4 text-primary" /> Recent transactions
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
                {ledger.transactions.map((t) => {
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
                          total >= 0 ? "text-emerald-400" : "text-rose-400"
                        )}
                      >
                        {total >= 0 ? "+" : ""}
                        {formatMoney(total, NZD)}
                      </td>
                      <td className="tnum px-4 py-2.5 text-right">
                        {t.type === "sell" && typeof t.realized_pnl === "number" ? (
                          <span className={t.realized_pnl >= 0 ? "text-emerald-400" : "text-rose-400"}>
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
    </div>
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
  holdings: Stock[];
  cash: number;
  onDone: (ledger: Ledger) => void;
}) {
  const isTrade = mode === "buy" || mode === "sell";
  const [assetType, setAssetType] = useState<AssetType>("stock");
  const [ticker, setTicker] = useState("");
  const [assetName, setAssetName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [fees, setFees] = useState("");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

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
    }
  }, [open, mode]);

  // Sell mode: the holding currently selected in the picker (for max qty + prefill).
  const selectedHolding = useMemo(() => {
    if (mode !== "sell") return null;
    return holdings.find((h) => h.ticker.toUpperCase() === ticker.trim().toUpperCase()) || null;
  }, [mode, holdings, ticker]);

  // When a sell target is chosen, prefill current price and asset name.
  function chooseHolding(h: Stock) {
    setTicker(h.ticker);
    setAssetType((h.asset_type as AssetType) || "stock");
    setAssetName(h.company_name || h.ticker);
    setPrice(h.current_price ? String(h.current_price) : "");
  }

  function handleBuyTickerBlur() {
    if (mode !== "buy") return;
    const t = ticker.trim().toUpperCase();
    if (!t) return;
    if (assetType === "crypto") {
      const coin = CRYPTO_DIRECTORY.find((c) => c.ticker === t);
      if (coin && !assetName) setAssetName(coin.name);
    } else {
      const info = lookupTicker(t);
      if (info && !assetName) setAssetName(info.name);
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
      if (!t) return toast.error("Ticker is required");
      if (!(q > 0)) return toast.error("Quantity must be greater than 0");
      if (!(p > 0)) return toast.error("Price must be greater than 0");
      if (mode === "sell") {
        if (!selectedHolding) return toast.error("Select a holding you own to sell");
        if (q > (selectedHolding.shares || 0) + 1e-6) {
          return toast.error(`You only hold ${formatNumber(selectedHolding.shares || 0)} of ${t}`);
        }
      }
    } else {
      const a = Number(amount);
      if (!(a > 0)) return toast.error("Amount must be greater than 0");
      if (mode === "withdraw" && a > cash + 1e-6) return toast.error("Insufficient cash balance");
    }

    setSaving(true);
    const payload: Record<string, unknown> = { type: mode, notes: notes.trim() || undefined };
    if (isTrade) {
      payload.ticker = ticker.trim().toUpperCase();
      payload.asset_type = assetType;
      payload.asset_name = assetName.trim() || undefined;
      payload.quantity = Number(quantity);
      payload.price = Number(price);
      if (Number(fees) > 0) payload.fees = Number(fees);
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">{titles[mode]}</DialogTitle>
          <DialogDescription>{descriptions[mode]}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* BUY: asset class + free ticker input */}
          {mode === "buy" && (
            <>
              <div className="space-y-2">
                <Label>Asset class</Label>
                <div className="grid grid-cols-2 gap-2">
                  {(["stock", "crypto"] as AssetType[]).map((a) => (
                    <button
                      key={a}
                      type="button"
                      onClick={() => setAssetType(a)}
                      className={cn(
                        "rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                        assetType === a
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border/60 text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {a === "stock" ? "Stox · Stocks" : "Koins · Crypto"}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="tx-ticker">Ticker</Label>
                <Input
                  id="tx-ticker"
                  list="tx-ticker-suggestions"
                  placeholder={assetType === "crypto" ? "e.g. BTC" : "e.g. NVDA, BHP.AX, AIR.NZ"}
                  value={ticker}
                  onChange={(e) => setTicker(e.target.value.toUpperCase())}
                  onBlur={handleBuyTickerBlur}
                  className="uppercase"
                />
                <datalist id="tx-ticker-suggestions">
                  {(assetType === "crypto" ? CRYPTO_DIRECTORY : TICKER_DIRECTORY).map((t) => (
                    <option key={t.ticker} value={t.ticker}>
                      {t.name}
                    </option>
                  ))}
                </datalist>
              </div>
            </>
          )}

          {/* SELL: pick from owned holdings */}
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
                          <span className="font-semibold">{h.ticker}</span>
                          <span className="text-xs text-muted-foreground">{h.company_name || ""}</span>
                        </span>
                        <span className="tnum text-xs text-muted-foreground">
                          {formatNumber(h.shares)} @ {formatMoney(h.current_price, currencyForTicker(h.ticker, (h.asset_type as AssetType) || "stock"))}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Trade quantity / price / fees */}
          {isTrade && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="tx-qty">Quantity</Label>
                  <Input
                    id="tx-qty"
                    type="number"
                    min="0"
                    step="any"
                    placeholder="10"
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
                    </button>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tx-price">Price / unit ({currency})</Label>
                  <Input
                    id="tx-price"
                    type="number"
                    min="0"
                    step="any"
                    placeholder="150.00"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                  />
                </div>
              </div>
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
                estimate >= 0 ? "text-emerald-400" : "text-rose-400"
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
          <Button onClick={submit} disabled={saving} className="font-semibold">
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
