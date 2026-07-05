"use client";

import { useEffect, useState } from "react";
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
import { Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { TICKER_DIRECTORY, lookupTicker } from "@/lib/market";
import { CRYPTO_DIRECTORY } from "@/lib/apex";
import type { Stock } from "@/lib/portfolio";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type AssetType = "stock" | "crypto";

interface StockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing?: Stock | null;
  onSaved: () => void;
  defaultAssetType?: AssetType;
}

export function StockDialog({ open, onOpenChange, editing, onSaved, defaultAssetType = "stock" }: StockDialogProps) {
  const [assetType, setAssetType] = useState<AssetType>(defaultAssetType);
  const [ticker, setTicker] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [sector, setSector] = useState("");
  const [shares, setShares] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [saving, setSaving] = useState(false);

  const isEdit = !!editing;
  const isCrypto = assetType === "crypto";

  // Bot-aware copy: Stox (stocks) vs Koins (crypto). Stocks use exchange
  // suffixes (.AX / .NZ / US); crypto is entered and displayed in US dollars.
  const copy = isCrypto
    ? {
        symbolLabel: "Currency type",
        symbolPlaceholder: "e.g. BTC",
        symbolHint: "Enter the currency symbol — BTC for Bitcoin, ETH for Ethereum, SOL for Solana.",
        amountLabel: "Currency amount",
        amountPlaceholder: "0.25",
        priceLabel: "Price when purchased (US$)",
        pricePlaceholder: "42000.00",
        priceHint: "Crypto is tracked in US dollars — enter the USD price you paid per coin.",
        nameLabel: "Coin name (optional)",
        namePlaceholder: "Bitcoin",
        sectorLabel: "Category (optional)",
        sectorPlaceholder: "Digital Assets",
        description: "Enter a currency and the amount you hold — all crypto values are shown in US dollars.",
        symbolRequired: "Currency type is required.",
        amountInvalid: "Currency amount must be greater than 0.",
        priceInvalid: "Purchase price (US$) must be greater than 0.",
      }
    : {
        symbolLabel: "Ticker",
        symbolPlaceholder: "e.g. AAPL, BHP.AX, AIR.NZ",
        symbolHint: "Use the exchange suffix: .AX for ASX (Australia), .NZ for NZX (New Zealand), no suffix for US listings.",
        amountLabel: "# of Shares owned",
        amountPlaceholder: "10",
        priceLabel: "Price purchased at ($)",
        pricePlaceholder: "150.00",
        priceHint: "",
        nameLabel: "Company (optional)",
        namePlaceholder: "Apple Inc.",
        sectorLabel: "Sector (optional)",
        sectorPlaceholder: "Technology",
        description: "Enter a ticker and we'll fill in the rest automatically.",
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
    }
  }, [open, editing]);

  // Auto-fill company + sector when a known ticker is typed (add mode only)
  function handleTickerBlur() {
    if (isEdit) return;
    if (assetType === "crypto") {
      const coin = CRYPTO_DIRECTORY.find((c) => c.ticker === ticker.trim().toUpperCase());
      if (coin) {
        if (!companyName) setCompanyName(coin.name);
        if (!sector) setSector("Digital Assets");
      }
      return;
    }
    const info = lookupTicker(ticker);
    if (info) {
      if (!companyName) setCompanyName(info.name);
      if (!sector) setSector(info.sector);
    }
  }

  async function handleSubmit() {
    const t = ticker.trim().toUpperCase();
    const sharesNum = Number(shares);
    const priceNum = Number(purchasePrice);

    if (!t) return toast.error(copy.symbolRequired);
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">
            {isEdit ? "Edit holding" : "Add a holding"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? isCrypto
                ? "Update the amount or purchase price (US$) for this position."
                : "Update the shares or purchase price for this position."
              : copy.description}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Asset class */}
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

          <div className="space-y-2">
            <Label htmlFor="ticker">{copy.symbolLabel}</Label>
            <Input
              id="ticker"
              list="ticker-suggestions"
              placeholder={copy.symbolPlaceholder}
              value={ticker}
              disabled={isEdit}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              onBlur={handleTickerBlur}
              className="uppercase"
            />
            <p className="text-xs leading-relaxed text-muted-foreground">{copy.symbolHint}</p>
            <datalist id="ticker-suggestions">
              {(isCrypto ? CRYPTO_DIRECTORY : TICKER_DIRECTORY).map((t) => (
                <option key={t.ticker} value={t.ticker}>
                  {t.name}
                </option>
              ))}
            </datalist>
          </div>

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
              <Label htmlFor="price">{copy.priceLabel}</Label>
              <Input
                id="price"
                type="number"
                min="0"
                step="any"
                placeholder={copy.pricePlaceholder}
                value={purchasePrice}
                onChange={(e) => setPurchasePrice(e.target.value)}
              />
            </div>
          </div>
          {copy.priceHint && (
            <p className="-mt-1 text-xs leading-relaxed text-muted-foreground">{copy.priceHint}</p>
          )}

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
          <Button onClick={handleSubmit} disabled={saving} className="font-semibold">
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
