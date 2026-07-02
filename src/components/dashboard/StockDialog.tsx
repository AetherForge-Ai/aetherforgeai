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
import type { Stock } from "@/lib/portfolio";
import { toast } from "sonner";

interface StockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing?: Stock | null;
  onSaved: () => void;
}

export function StockDialog({ open, onOpenChange, editing, onSaved }: StockDialogProps) {
  const [ticker, setTicker] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [sector, setSector] = useState("");
  const [shares, setShares] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [saving, setSaving] = useState(false);

  const isEdit = !!editing;

  useEffect(() => {
    if (open) {
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

    if (!t) return toast.error("Ticker symbol is required.");
    if (!(sharesNum > 0)) return toast.error("Shares must be greater than 0.");
    if (!(priceNum > 0)) return toast.error("Purchase price must be greater than 0.");

    setSaving(true);
    const payload = {
      ticker: t,
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
              ? "Update the shares or purchase price for this position."
              : "Enter a ticker and we'll fill in the rest automatically."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-2">
            <Label htmlFor="ticker">Ticker symbol</Label>
            <Input
              id="ticker"
              list="ticker-suggestions"
              placeholder="e.g. AAPL"
              value={ticker}
              disabled={isEdit}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              onBlur={handleTickerBlur}
              className="uppercase"
            />
            <datalist id="ticker-suggestions">
              {TICKER_DIRECTORY.map((t) => (
                <option key={t.ticker} value={t.ticker}>
                  {t.name}
                </option>
              ))}
            </datalist>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="shares">Shares</Label>
              <Input
                id="shares"
                type="number"
                min="0"
                step="any"
                placeholder="10"
                value={shares}
                onChange={(e) => setShares(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="price">Purchase price</Label>
              <Input
                id="price"
                type="number"
                min="0"
                step="any"
                placeholder="150.00"
                value={purchasePrice}
                onChange={(e) => setPurchasePrice(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="company">Company (optional)</Label>
              <Input
                id="company"
                placeholder="Apple Inc."
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sector">Sector (optional)</Label>
              <Input
                id="sector"
                placeholder="Technology"
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
