"use client";

import { useEffect, useMemo, useState } from "react";
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
import { Loader2, DollarSign, TrendingUp, ShoppingCart, Wallet, AlertTriangle } from "lucide-react";
import { api } from "@/lib/api";
import { formatMoney, currencyForTicker, type CurrencyCode } from "@/lib/currency";
import { formatNumber } from "@/lib/portfolio";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export interface BuyTarget {
  ticker: string; // internal ticker, e.g. BHP.AX or BTC
  name?: string;
  assetType?: "stock" | "crypto";
  price?: number; // live current price (native currency)
}

/**
 * Shared "Buy / Add to Portfolio" modal. The user enters the DOLLAR AMOUNT they
 * want to invest; shares are auto-calculated from the live price (and remain
 * editable). Confirming records a real BUY transaction — which adds the holding,
 * re-averages cost, debits cash and recalculates every portfolio metric — then
 * closes and refreshes the dashboard.
 *
 * Cash balance is loaded on open and shown so the user can see exactly how much
 * buying power they have before committing.
 */
export function BuyDialog({
  open,
  onOpenChange,
  target,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  target: BuyTarget | null;
  onDone: () => void;
}) {
  const assetType = target?.assetType || "stock";
  const ticker = target?.ticker || "";
  const currency: CurrencyCode = ticker ? currencyForTicker(ticker, assetType) : "USD";
  const displaySymbol = ticker.replace(/\.(NZ|AX|L)$/i, "");

  const [amount, setAmount] = useState("");
  const [shares, setShares] = useState("");
  const [price, setPrice] = useState("");
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [priceLoading, setPriceLoading] = useState(false);
  const [priceEdited, setPriceEdited] = useState(false);

  // Cash balance (NZD) — loaded every time the dialog opens.
  const [cashBalance, setCashBalance] = useState<number | null>(null);
  const [cashLoading, setCashLoading] = useState(false);

  // Reset + prefill whenever the dialog opens for a new target.
  useEffect(() => {
    if (open && target) {
      const p = target.price && target.price > 0 ? target.price : 0;
      setPrice(p ? String(p) : "");
      setAmount("");
      setShares("");
      setNotes("");
      setPriceEdited(false);
      setDate(new Date().toISOString().slice(0, 10));
    }
  }, [open, target]);

  // Load cash balance when the dialog opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setCashLoading(true);
      const res = await api.get<{ cashBalance: number }>("/api/transactions");
      if (cancelled) return;
      setCashLoading(false);
      if (res.ok && res.data && typeof res.data.cashBalance === "number") {
        setCashBalance(res.data.cashBalance);
        console.log(`[buy-dialog] Cash balance: ${res.data.cashBalance} NZD`);
      } else {
        console.error("[buy-dialog] Could not load cash balance:", res.error);
        setCashBalance(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Always anchor a crypto buy to the FRESHEST live price at open time. The price
  // passed in from a list can be a few seconds stale (or, for a coin the caller
  // couldn't price, missing entirely), so we re-fetch the current Swyftx price so
  // the "Live price" is always real. Skipped once the user overrides the price.
  useEffect(() => {
    if (!open || !target || assetType !== "crypto" || !ticker) return;
    let cancelled = false;
    (async () => {
      setPriceLoading(true);
      const res = await api.get<{ symbol: string; price: number }>(
        `/api/crypto/price?symbol=${encodeURIComponent(displaySymbol)}`
      );
      if (cancelled) return;
      setPriceLoading(false);
      if (res.ok && res.data && res.data.price > 0) {
        const live = res.data.price;
        console.log(`[buy-dialog] Live crypto price for ${displaySymbol}: ${live}`);
        // Don't clobber a price the user has already typed over.
        if (priceEdited) return;
        setPrice(String(live));
        // If the user already entered a dollar amount while the fetch was in
        // flight, re-derive shares off the fresh live price so the two stay in sync.
        setAmount((a) => {
          const amt = Number(a) || 0;
          if (amt > 0) setShares(String(+(amt / live).toFixed(6)));
          return a;
        });
      } else {
        console.error(`[buy-dialog] Could not fetch live price for ${displaySymbol}:`, res.error);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Intentionally only re-run when the dialog opens for a new coin.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ticker, assetType]);

  const priceNum = Number(price) || 0;
  const amountNum = Number(amount) || 0;
  const sharesNum = Number(shares) || 0;

  // Dollar amount is the primary driver — editing it recomputes shares.
  function onAmountChange(v: string) {
    setAmount(v);
    const a = Number(v) || 0;
    if (priceNum > 0) setShares(a > 0 ? String(+(a / priceNum).toFixed(6)) : "");
  }
  // Editing shares recomputes the dollar amount.
  function onSharesChange(v: string) {
    setShares(v);
    const s = Number(v) || 0;
    if (priceNum > 0) setAmount(s > 0 ? String(+(s * priceNum).toFixed(2)) : "");
  }
  // Editing price keeps the dollar amount fixed and re-derives shares.
  function onPriceChange(v: string) {
    setPrice(v);
    setPriceEdited(true);
    const p = Number(v) || 0;
    if (p > 0 && amountNum > 0) setShares(String(+(amountNum / p).toFixed(6)));
  }

  const totalCost = useMemo(() => sharesNum * priceNum, [sharesNum, priceNum]);
  const valid = amountNum > 0 && sharesNum > 0 && priceNum > 0;

  // Remaining cash after this purchase (NZD). Note: asset currency may differ
  // from NZD cash — we still compare against cashBalance for a clear UI signal.
  const remainingCash =
    cashBalance != null && totalCost > 0 ? cashBalance - totalCost : cashBalance;
  const exceedsCash =
    cashBalance != null && totalCost > 0 && totalCost > cashBalance + 1e-6;

  async function confirm() {
    if (!ticker) return toast.error("No ticker selected");
    if (!(priceNum > 0)) return toast.error("Enter a valid price per share");
    if (!(amountNum > 0)) return toast.error("Enter the dollar amount to invest");
    if (!(sharesNum > 0)) return toast.error("Number of shares must be greater than 0");
    if (exceedsCash) {
      return toast.error(
        `Insufficient cash — you have ${formatMoney(cashBalance ?? 0, "NZD")} available`
      );
    }

    setSaving(true);
    const payload = {
      type: "buy" as const,
      ticker: ticker.toUpperCase(),
      asset_type: assetType,
      asset_name: target?.name || undefined,
      quantity: +sharesNum.toFixed(6),
      price: +priceNum.toFixed(6),
      notes: notes.trim() || undefined,
      executed_at: date ? new Date(date).toISOString() : undefined,
    };
    console.log("[buy-dialog] Submitting buy:", payload);
    const res = await api.post("/api/transactions", payload);
    setSaving(false);

    if (res.ok) {
      toast.success(`Bought ${formatNumber(sharesNum)} ${displaySymbol} · ${formatMoney(totalCost, currency)}`);
      onOpenChange(false);
      onDone();
    } else {
      console.error("[buy-dialog] Buy failed:", res.error);
      toast.error(typeof res.error === "string" ? res.error : "Could not record the purchase.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100dvh-1.5rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogHeader className="shrink-0 border-b border-border/60 px-5 py-4 sm:px-6">
          <DialogTitle className="flex items-center gap-2 font-display text-lg sm:text-xl">
            <ShoppingCart className="size-5 text-primary" /> Buy {displaySymbol || "position"}
          </DialogTitle>
          <DialogDescription>
            {target?.name ? `${target.name} · ` : ""}Enter the dollar amount to invest — we&apos;ll work out the
            shares and debit your cash balance.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4 sm:px-6">
          {/* Cash balance — money the purchase comes off */}
          <div
            className={cn(
              "flex items-center justify-between rounded-xl border px-4 py-3",
              exceedsCash
                ? "border-rose-500/40 bg-rose-500/10"
                : "border-emerald-500/30 bg-emerald-500/10"
            )}
          >
            <div className="flex items-center gap-2.5">
              <span
                className={cn(
                  "grid size-9 place-items-center rounded-lg",
                  exceedsCash ? "bg-rose-500/15 text-rose-500" : "bg-emerald-500/15 text-emerald-600"
                )}
              >
                <Wallet className="size-4" />
              </span>
              <div>
                <p className="text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground">
                  Available cash
                </p>
                <p className="tnum font-display text-lg font-bold">
                  {cashLoading ? (
                    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                      <Loader2 className="size-3.5 animate-spin" /> Loading…
                    </span>
                  ) : cashBalance != null ? (
                    formatMoney(cashBalance, "NZD")
                  ) : (
                    "—"
                  )}
                </p>
              </div>
            </div>
            {cashBalance != null && !cashLoading && (
              <button
                type="button"
                onClick={() => {
                  if (cashBalance > 0) onAmountChange(String(+cashBalance.toFixed(2)));
                }}
                disabled={!(cashBalance > 0)}
                className="rounded-lg border border-border/60 bg-background/50 px-2.5 py-1.5 text-xs font-semibold text-primary transition-colors hover:border-primary/40 hover:bg-primary/10 disabled:opacity-40"
              >
                Use all
              </button>
            )}
          </div>

          {/* Ticker + live price banner */}
          <div className="flex items-center justify-between rounded-xl border border-primary/25 bg-primary/8 px-4 py-3">
            <div>
              <p className="font-display text-lg font-bold">{displaySymbol}</p>
              <p className="text-xs text-muted-foreground">{target?.name || "Selected security"}</p>
            </div>
            <div className="text-right">
              <p className="flex items-center justify-end gap-1 text-[0.62rem] uppercase tracking-wide text-muted-foreground">
                {priceLoading && <Loader2 className="size-3 animate-spin" />} Live price
              </p>
              <p className="tnum font-display text-lg font-bold text-primary">
                {priceNum > 0 ? (
                  formatMoney(priceNum, currency)
                ) : priceLoading ? (
                  <span className="text-sm font-medium text-muted-foreground">Fetching…</span>
                ) : (
                  "—"
                )}
              </p>
            </div>
          </div>

          {/* Dollar amount invested — the prominent field */}
          <div className="space-y-2">
            <Label htmlFor="buy-amount" className="text-sm font-semibold">
              Dollar amount invested ({currency})
            </Label>
            <div className="relative">
              <DollarSign className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-primary" />
              <Input
                id="buy-amount"
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                placeholder="1000.00"
                value={amount}
                onChange={(e) => onAmountChange(e.target.value)}
                className={cn(
                  "h-12 pl-9 text-lg font-semibold",
                  exceedsCash && "border-rose-500/50 focus-visible:ring-rose-500/40"
                )}
                autoFocus
              />
            </div>
            {/* Quick-fill chips */}
            <div className="flex flex-wrap gap-2">
              {[500, 1000, 2500, 5000].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => onAmountChange(String(v))}
                  className="rounded-lg border border-border/60 bg-background/40 px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                >
                  {formatMoney(v, currency, { compact: true })}
                </button>
              ))}
            </div>
            {exceedsCash && (
              <p className="flex items-center gap-1.5 text-xs font-medium text-rose-500">
                <AlertTriangle className="size-3.5 shrink-0" />
                Exceeds available cash by {formatMoney(totalCost - (cashBalance ?? 0), "NZD")}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="buy-shares">Number of shares</Label>
              <Input
                id="buy-shares"
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                placeholder="0"
                value={shares}
                onChange={(e) => onSharesChange(e.target.value)}
              />
              <p className="text-[0.68rem] text-muted-foreground">Auto-calculated · editable</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="buy-price">Price / share ({currency})</Label>
              <Input
                id="buy-price"
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                placeholder="0.00"
                value={price}
                onChange={(e) => onPriceChange(e.target.value)}
              />
              <p className="text-[0.68rem] text-muted-foreground">Live — override if needed</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="buy-date">Purchase date</Label>
              <Input
                id="buy-date"
                type="date"
                value={date}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="buy-notes">Notes (optional)</Label>
              <Input
                id="buy-notes"
                placeholder="e.g. Long-term hold"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>

          {/* Summary before confirming */}
          <div className="rounded-xl border border-border/60 bg-background/40 p-3.5">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">You&apos;ll buy</span>
              <span className="tnum font-semibold">
                {sharesNum > 0 ? formatNumber(sharesNum) : "—"} {displaySymbol}
              </span>
            </div>
            <div className="mt-1.5 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Est. total cost</span>
              <span className={cn("tnum font-semibold", exceedsCash && "text-rose-500")}>
                {totalCost > 0 ? formatMoney(totalCost, currency) : "—"}
              </span>
            </div>
            <div className="mt-1.5 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Cash after purchase</span>
              <span
                className={cn(
                  "tnum font-semibold",
                  remainingCash != null && remainingCash < 0 ? "text-rose-500" : "text-emerald-600"
                )}
              >
                {remainingCash != null && totalCost > 0
                  ? formatMoney(remainingCash, "NZD")
                  : cashBalance != null
                    ? formatMoney(cashBalance, "NZD")
                    : "—"}
              </span>
            </div>
            <p className="mt-2 flex items-center gap-1.5 text-[0.68rem] text-muted-foreground">
              <TrendingUp className="size-3" /> Adds the holding, re-averages cost &amp; debits your cash balance.
            </p>
          </div>
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t border-border/60 bg-background px-5 py-4 sm:px-6">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={confirm}
            disabled={saving || !valid || exceedsCash}
            className={cn("font-semibold shadow-glow")}
          >
            {saving ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" /> Buying…
              </>
            ) : (
              <>
                <ShoppingCart className="mr-2 size-4" /> Confirm purchase
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
