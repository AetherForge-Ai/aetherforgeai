"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import { Loader2, Check, Lock, CalendarDays, Info } from "lucide-react";
import { api } from "@/lib/api";
import { lookupTicker } from "@/lib/market";
import { TickerSearch } from "@/components/dashboard/TickerSearch";
import { CryptoSearch } from "@/components/dashboard/CryptoSearch";
import type { Stock } from "@/lib/portfolio";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { keepDialogOpenOnPortalInteraction, keepDialogOpenWhilePopoverOpen } from "@/lib/dialog-guards";

type AssetType = "stock" | "crypto";

interface StockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing?: Stock | null;
  onSaved: () => void;
  defaultAssetType?: AssetType;
}

/** Local yyyy-mm-dd for "today" — the boundary that flips the price lock on/off. */
function todayISO(): string {
  const d = new Date();
  // Use local date parts so "today" matches the user's calendar, not UTC.
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 10);
}

export function StockDialog({ open, onOpenChange, editing, onSaved, defaultAssetType = "stock" }: StockDialogProps) {
  const todayStr = useMemo(() => todayISO(), []);

  const [assetType, setAssetType] = useState<AssetType>(defaultAssetType);
  const [ticker, setTicker] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [sector, setSector] = useState("");
  const [shares, setShares] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");
  // Purchase date drives the price logic: today ⇒ live price locked; past ⇒ editable.
  const [purchaseDate, setPurchaseDate] = useState(todayStr);
  const [saving, setSaving] = useState(false);
  // True once we've auto-filled the "amount paid" with the live price (past dates),
  // so we can show a confirmation hint. Cleared as soon as the user edits it by hand.
  const [pricePrefilled, setPricePrefilled] = useState(false);
  const [priceLoading, setPriceLoading] = useState(false);
  // True when the date is today but no live price could be fetched (market closed /
  // invalid ticker / provider down) — we then UNLOCK the field for manual entry.
  const [liveUnavailable, setLiveUnavailable] = useState(false);

  const isEdit = !!editing;
  const isCrypto = assetType === "crypto";
  const isToday = purchaseDate === todayStr;
  // The price is locked to the live market price only when: date is today AND we
  // actually have (or are fetching) a live quote. If live data is unavailable we
  // fall back to a manual, editable field so the user is never blocked.
  const priceLocked = isToday && !liveUnavailable;

  // Keep the latest ticker in a ref so the date handler always fetches for the
  // current selection without re-creating callbacks.
  const tickerRef = useRef(ticker);
  tickerRef.current = ticker;

  const copy = isCrypto
    ? {
        symbolLabel: "Currency type",
        symbolHint: "Pick a coin from the live list — its current buy price fills in automatically below.",
        amountLabel: "Currency amount",
        amountPlaceholder: "0.25",
        priceLabel: "Paid for (US$ / coin)",
        pricePlaceholder: "42000.00",
        priceHint: "Crypto is tracked in US dollars — enter the USD price you paid per coin.",
        nameLabel: "Coin name (optional)",
        namePlaceholder: "Bitcoin",
        sectorLabel: "Category (optional)",
        sectorPlaceholder: "Digital Assets",
        description: "Choose the purchase date first, then pick a coin and the amount you hold.",
        symbolRequired: "Currency type is required.",
        amountInvalid: "Currency amount must be greater than 0.",
        priceInvalid: "Purchase price (US$) must be greater than 0.",
      }
    : {
        symbolLabel: "Ticker",
        symbolHint: "Search any ASX, NZX, NASDAQ or NYSE company — we'll fill in the current market price for you.",
        amountLabel: "# of Shares owned",
        amountPlaceholder: "10",
        priceLabel: "Paid for ($ / share)",
        pricePlaceholder: "150.00",
        priceHint: "Enter the price you paid per share on the purchase date.",
        nameLabel: "Company (optional)",
        namePlaceholder: "Apple Inc.",
        sectorLabel: "Sector (optional)",
        sectorPlaceholder: "Technology",
        description: "Choose the purchase date first, then enter a ticker and we'll do the rest.",
        symbolRequired: "Ticker symbol is required.",
        amountInvalid: "Shares owned must be greater than 0.",
        priceInvalid: "Purchase price must be greater than 0.",
      };

  useEffect(() => {
    if (open) {
      setAssetType((editing?.asset_type as AssetType) ?? defaultAssetType);
      setTicker(editing?.ticker ?? "");
      setCompanyName(editing?.company_name ?? "");
      setSector(editing?.sector ?? "");
      setShares(editing ? String(editing.shares) : "");
      setPurchasePrice(editing ? String(editing.purchase_price) : "");
      // New holdings default to today (⇒ live-price lock). Editing keeps the stored
      // date; legacy rows without one fall back to today.
      setPurchaseDate(editing?.purchase_date ? String(editing.purchase_date).slice(0, 10) : todayStr);
      setPricePrefilled(false);
      setPriceLoading(false);
      // When editing an existing holding we never want the stored purchase price to
      // be overwritten as "locked to live" on open — keep it editable unless the user
      // actively re-selects today. So mark live as unavailable for edits until acted on.
      setLiveUnavailable(!!editing);
    }
  }, [open, editing, defaultAssetType, todayStr]);

  /** Fetch the live price for a symbol. Crypto can pass a price already in hand. */
  async function fetchLivePrice(sym: string, type: AssetType, carried?: number): Promise<number | null> {
    if (type === "crypto" && carried && carried > 0) return carried;
    const res = await api.get<{ price: number | null }>(
      `/api/tickers/quote?symbol=${encodeURIComponent(sym)}&type=${type}`
    );
    return res.ok && res.data?.price && res.data.price > 0 ? res.data.price : null;
  }

  /** Lock the "paid for" field to today's live price (or unlock for manual entry). */
  async function lockToLivePrice(sym: string, type: AssetType, carried?: number) {
    setPriceLoading(true);
    setLiveUnavailable(false);
    const live = await fetchLivePrice(sym, type, carried);
    setPriceLoading(false);
    if (live != null) {
      setPurchasePrice(String(live));
      setPricePrefilled(false);
      setLiveUnavailable(false);
      console.log(`[dashboard] Locked ${sym} to today's live price: ${live}`);
    } else {
      // Edge case — market closed / invalid ticker / provider outage. Never block
      // the user: unlock the field so they can type the amount manually.
      setLiveUnavailable(true);
      console.warn(`[dashboard] No live price for ${sym} today — unlocking for manual entry.`);
    }
  }

  // Selecting a crypto: fill name/category, then either lock to live (today) or
  // prefill the current price as an editable suggestion (past date).
  function handleCryptoSelect(coin: { symbol: string; name: string; price: number }) {
    const sym = coin.symbol.toUpperCase();
    setTicker(sym);
    setCompanyName(coin.name);
    setSector((s) => s || "Digital Assets");
    if (isToday) {
      void lockToLivePrice(sym, "crypto", coin.price);
    } else if (coin.price > 0) {
      setPurchasePrice(String(coin.price));
      setPricePrefilled(true);
      setLiveUnavailable(false);
    }
  }

  // Selecting a stock: fill the company/sector, then fetch its live quote and either
  // lock it (today) or offer it as an editable suggestion (past date).
  async function handleStockSelect(m: { symbol: string; name: string }) {
    const sym = m.symbol.toUpperCase();
    setTicker(sym);
    setCompanyName(m.name);
    const info = lookupTicker(sym);
    if (info && !sector) setSector(info.sector);

    if (isToday) {
      await lockToLivePrice(sym, "stock");
      return;
    }
    // Past date — suggest the current price but keep it fully editable.
    setPriceLoading(true);
    setLiveUnavailable(false);
    const live = await fetchLivePrice(sym, "stock");
    setPriceLoading(false);
    if (live != null) {
      setPurchasePrice(String(live));
      setPricePrefilled(true);
      console.log(`[dashboard] Suggested live price for ${sym}: ${live}`);
    }
  }

  // Changing the date flips the price behaviour on the fly.
  function handleDateChange(v: string) {
    setPurchaseDate(v);
    const sym = tickerRef.current.trim().toUpperCase();
    const nowToday = v === todayStr;
    if (!sym) {
      // No ticker yet — price logic applies once one is chosen.
      setLiveUnavailable(false);
      return;
    }
    if (nowToday) {
      void lockToLivePrice(sym, assetType);
    } else {
      // Past date → unlock and let the user type the exact historical price.
      setLiveUnavailable(false);
      setPricePrefilled(false);
    }
  }

  async function handleSubmit() {
    const t = ticker.trim().toUpperCase();
    const sharesNum = Number(shares);
    const priceNum = Number(purchasePrice);

    if (!t) return toast.error(copy.symbolRequired);
    if (!purchaseDate) return toast.error("Purchase date is required.");
    if (purchaseDate > todayStr) return toast.error("Purchase date can't be in the future.");
    if (!(sharesNum > 0)) return toast.error(copy.amountInvalid);
    if (!(priceNum > 0)) return toast.error(copy.priceInvalid);

    setSaving(true);
    const payload = {
      ticker: t,
      asset_type: assetType,
      company_name: companyName.trim() || undefined,
      sector: sector.trim() || undefined,
      shares: sharesNum,
      purchase_price: priceNum,
      purchase_date: purchaseDate,
    };

    console.log(`[dashboard] ${isEdit ? "Updating" : "Creating"} stock`, payload);

    const res = isEdit
      ? await api.put(`/api/stocks/${editing!._id}`, payload)
      : await api.post("/api/stocks", payload);

    setSaving(false);

    if (res.ok) {
      toast.success(isEdit ? "Holding updated" : `${t} added to your portfolio`);
      onOpenChange(false);
      onSaved();
    } else {
      console.error("[dashboard] Save stock failed:", res.error);
      toast.error(typeof res.error === "string" ? res.error : "Could not save holding.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-md"
        // Keep the dialog open when interacting with the portaled ticker search /
        // date picker dropdowns (see dialog-guards for the why).
        onInteractOutside={keepDialogOpenOnPortalInteraction}
        onEscapeKeyDown={keepDialogOpenWhilePopoverOpen}
      >
        <DialogHeader>
          <DialogTitle className="font-display text-xl">
            {isEdit ? "Edit holding" : "Add a holding"}
          </DialogTitle>
          <DialogDescription>
            {isEdit ? "Update the date, amount or purchase price for this position." : copy.description}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* 1 · Purchase date — the very first field; it governs the price logic */}
          <div className="space-y-2">
            <Label htmlFor="purchase-date" className="flex items-center gap-1.5 font-semibold">
              <CalendarDays className="size-3.5 text-primary" /> Purchase date
              <span className="text-destructive">*</span>
            </Label>
            <Input
              id="purchase-date"
              type="date"
              max={todayStr}
              value={purchaseDate}
              onChange={(e) => handleDateChange(e.target.value)}
              className="font-medium"
            />
            <p className="flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground">
              <Info className="mt-0.5 size-3 shrink-0" />
              {isToday
                ? "Today selected — the price below locks to the live market price automatically."
                : "Past date — enter the exact price you paid below. Pick today to auto-fill the live price."}
            </p>
          </div>

          {/* 2 · Asset class */}
          <div className="space-y-2">
            <Label>Asset class</Label>
            <div className="grid grid-cols-2 gap-2">
              {(["stock", "crypto"] as AssetType[]).map((a) => (
                <button
                  key={a}
                  type="button"
                  disabled={isEdit}
                  onClick={() => setAssetType(a)}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-sm font-medium capitalize transition-colors disabled:opacity-60",
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

          {/* 3 · Ticker / coin picker */}
          <div className="space-y-2">
            <Label htmlFor="ticker">{copy.symbolLabel}</Label>
            {isEdit ? (
              // Ticker is locked once a holding exists — only date/amount/price change.
              <Input id="ticker" value={ticker} disabled className="uppercase" />
            ) : isCrypto ? (
              <CryptoSearch value={ticker} label={companyName} onSelect={handleCryptoSelect} />
            ) : (
              <TickerSearch value={ticker} label={companyName} onSelect={handleStockSelect} />
            )}
            <p className="text-xs leading-relaxed text-muted-foreground">{copy.symbolHint}</p>
          </div>

          {/* 4 · Amount + price paid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="shares">{copy.amountLabel}</Label>
              <Input
                id="shares"
                type="number"
                min="0"
                step="any"
                placeholder={copy.amountPlaceholder}
                value={shares}
                onChange={(e) => setShares(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="price" className="flex items-center gap-1.5">
                {copy.priceLabel}
                {priceLoading && <Loader2 className="size-3 animate-spin text-muted-foreground" />}
                {priceLocked && !priceLoading && <Lock className="size-3 text-emerald-500" />}
              </Label>
              <div className="relative">
                <Input
                  id="price"
                  type="number"
                  min="0"
                  step="any"
                  placeholder={priceLoading ? "Fetching live price…" : copy.pricePlaceholder}
                  value={purchasePrice}
                  disabled={priceLocked}
                  aria-readonly={priceLocked}
                  title={priceLocked ? "Locked to today's live market price" : undefined}
                  onChange={(e) => {
                    setPurchasePrice(e.target.value);
                    setPricePrefilled(false);
                  }}
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

          {/* Contextual price hint */}
          {priceLocked ? (
            <p className="-mt-1 flex items-start gap-1.5 text-xs leading-relaxed text-emerald-500">
              <Lock className="mt-0.5 size-3.5 shrink-0" />
              <span>
                <strong>Locked to today&apos;s live price.</strong> Because the purchase date is today, this is the
                current market price and can&apos;t be edited. Pick an earlier date to enter a price manually.
              </span>
            </p>
          ) : isToday && liveUnavailable ? (
            <p className="-mt-1 flex items-start gap-1.5 text-xs leading-relaxed text-amber-500">
              <Info className="mt-0.5 size-3.5 shrink-0" />
              <span>
                We couldn&apos;t fetch a live price right now (the market may be closed or the ticker is
                unrecognised). Enter the amount you paid manually.
              </span>
            </p>
          ) : pricePrefilled ? (
            <p className="-mt-1 flex items-center gap-1.5 text-xs leading-relaxed text-emerald-500">
              <Check className="size-3.5" /> Filled with the current live price — edit it if you paid a different amount.
            </p>
          ) : (
            <p className="-mt-1 text-xs leading-relaxed text-muted-foreground">{copy.priceHint}</p>
          )}

          {/* 5 · Name + sector */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="company">{copy.nameLabel}</Label>
              <Input
                id="company"
                placeholder={copy.namePlaceholder}
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sector">{copy.sectorLabel}</Label>
              <Input
                id="sector"
                placeholder={copy.sectorPlaceholder}
                value={sector}
                onChange={(e) => setSector(e.target.value)}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving || priceLoading} className="font-semibold">
            {saving ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" /> Saving…
              </>
            ) : isEdit ? (
              "Save changes"
            ) : (
              "Add holding"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
