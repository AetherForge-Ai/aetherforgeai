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
import { Loader2, DollarSign, TrendingUp, ShoppingCart } from "lucide-react";
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

  // Reset + prefill whenever the dialog opens for a new target.
  useEffect(() => {
    if (open && target) {
      const p = target.price && target.price > 0 ? target.price : 0;
      setPrice(p ? String(p) : "");
      setAmount("");
      setShares("");
      setNotes("");
      setDate(new Date().toISOString().slice(0, 10));
    }
  }, [open, target]);

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
    const p = Number(v) || 0;
    if (p > 0 && amountNum > 0) setShares(String(+(amountNum / p).toFixed(6)));
  }

  const totalCost = useMemo(() => sharesNum * priceNum, [sharesNum, priceNum]);
  const valid = amountNum > 0 && sharesNum > 0 && priceNum > 0;

  async function confirm() {
    if (!ticker) return toast.error("No ticker selected");
    if (!(priceNum > 0)) return toast.error("Enter a valid price per share");
    if (!(amountNum > 0)) return toast.error("Enter the dollar amount to invest");
    if (!(sharesNum > 0)) return toast.error("Number of shares must be greater than 0");

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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display text-xl">
            <ShoppingCart className="size-5 text-primary" /> Buy {displaySymbol || "position"}
          </DialogTitle>
          <DialogDescription>
            {target?.name ? `${target.name} · ` : ""}Enter the dollar amount to invest — we'll work out the
            shares and add it straight to your portfolio.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Ticker + live price banner */}
          <div className="flex items-center justify-between rounded-xl border border-primary/25 bg-primary/8 px-4 py-3">
            <div>
              <p className="font-display text-lg font-bold">{displaySymbol}</p>
              <p className="text-xs text-muted-foreground">{target?.name || "Selected security"}</p>
            </div>
            <div className="text-right">
              <p className="text-[0.62rem] uppercase tracking-wide text-muted-foreground">Live price</p>
              <p className="tnum font-display text-lg font-bold text-primary">
                {priceNum > 0 ? formatMoney(priceNum, currency) : "—"}
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
                className="h-12 pl-9 text-lg font-semibold"
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
              <span className="text-muted-foreground">You'll buy</span>
              <span className="tnum font-semibold">
                {sharesNum > 0 ? formatNumber(sharesNum) : "—"} {displaySymbol}
              </span>
            </div>
            <div className="mt-1.5 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Est. total cost</span>
              <span className="tnum font-semibold">
                {totalCost > 0 ? formatMoney(totalCost, currency) : "—"}
              </span>
            </div>
            <p className="mt-2 flex items-center gap-1.5 text-[0.68rem] text-muted-foreground">
              <TrendingUp className="size-3" /> Adds the holding, re-averages cost & debits your cash balance.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={confirm} disabled={saving || !valid} className={cn("font-semibold shadow-glow")}>
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
