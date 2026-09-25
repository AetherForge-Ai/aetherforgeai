"use client";

/**
 * Stox / Koins / Headmaster recommendation confirm flow.
 * Suggestions start as idea|paper — never create execution_status=filled or realized P&L
 * until the user confirms "I filled this" with a typed fill.
 */

import { useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ADVISORY_NOTE } from "@/lib/fill-integrity-client";
import { currencyForTicker } from "@/lib/currency";
import { useFxRates } from "@/hooks/useFxRates";
import { buildTradePreview, type TradePreview } from "@/lib/trade-preview";
import { bumpHoldingsGeneration } from "@/lib/holdings-generation";
import { TradeReview } from "@/components/dashboard/TradeReview";
import { Lightbulb, FileText, CheckCircle2 } from "lucide-react";

export interface RecommendationTarget {
  ticker: string;
  name?: string;
  assetType: "stock" | "crypto";
  signalPrice?: number;
  livePrice?: number;
}

export function RecommendationActions({
  target,
  onDone,
}: {
  target: RecommendationTarget;
  onDone?: () => void;
}) {
  const [fill, setFill] = useState("");
  const [qty, setQty] = useState("");
  const [fees, setFees] = useState("");
  const [busy, setBusy] = useState<"idea" | "paper" | "filled" | null>(null);
  const [review, setReview] = useState<TradePreview | null>(null);
  const submittingRef = useRef(false);
  const { rates } = useFxRates();

  function clearReview() {
    setReview(null);
  }

  async function save(status: "idea" | "paper" | "filled") {
    const ticker = target.ticker.toUpperCase();
    if (status === "filled") {
      const fillNum = Number(fill);
      const qtyNum = Number(qty);
      if (!(fillNum > 0) || !(qtyNum > 0)) {
        return toast.error('Type fill price and quantity, then confirm "I filled this".');
      }
      if (!review) {
        let cash = 0;
        const cashRes = await api.get<{ cashBalance?: number }>("/api/transactions");
        if (cashRes.ok && cashRes.data && typeof cashRes.data.cashBalance === "number") {
          cash = cashRes.data.cashBalance;
        }
        setReview(
          buildTradePreview({
            side: "buy",
            asset: ticker,
            assetName: target.name,
            quantity: qtyNum,
            price: fillNum,
            fee: Number(fees) > 0 ? Number(fees) : 0,
            currency: currencyForTicker(ticker, target.assetType),
            cashNzd: cash,
            rates,
          })
        );
        return;
      }
      if (submittingRef.current) return;
      submittingRef.current = true;
      setBusy(status);
      const res = await api.post("/api/transactions", {
        type: "buy",
        ticker,
        asset_type: target.assetType,
        asset_name: target.name,
        quantity: qtyNum,
        price: fillNum,
        execution_status: "filled",
        price_source: "user_fill",
        signal_price: target.signalPrice,
        mark_price: target.livePrice,
        cash_or_notional: qtyNum * fillNum,
        fees: Number(fees) > 0 ? Number(fees) : undefined,
        notes: `User confirmed broker fill. Signal was ${target.signalPrice ?? "n/a"}. ${ADVISORY_NOTE}`,
      });
      setBusy(null);
      submittingRef.current = false;
      if (!res.ok) return toast.error(typeof res.error === "string" ? res.error : "Fill blocked");
      toast.success(`Filled ${ticker} recorded`);
      setReview(null);
      bumpHoldingsGeneration();
      onDone?.();
      return;
    }

    setBusy(status);
    const price = target.signalPrice || target.livePrice || 1;
    const res = await api.post("/api/stocks", {
      ticker,
      asset_type: target.assetType,
      company_name: target.name,
      shares: 1,
      purchase_price: price,
      execution_status: status,
      price_source: "bot_signal",
      notes: `${status} from recommendation.` +
        (Number(fees) > 0 ? ` Fees (reference): ${Number(fees)}.` : "") +
        ` ${ADVISORY_NOTE}`,
      fees: Number(fees) > 0 ? Number(fees) : undefined,
    });
    setBusy(null);
    if (!res.ok) return toast.error(typeof res.error === "string" ? res.error : "Could not save");
    toast.success(status === "idea" ? "Saved as idea (not a fill)" : "Marked paper-traded (no realized P&L)");
    onDone?.();
  }

  return (
    <div className="space-y-3 rounded-xl border border-border/60 bg-card/40 p-3">
      <p className="text-xs text-muted-foreground">{ADVISORY_NOTE}</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" disabled={!!busy} onClick={() => void save("idea")}>
          <Lightbulb className="mr-1.5 size-3.5" /> Save as idea
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={!!busy} onClick={() => void save("paper")}>
          <FileText className="mr-1.5 size-3.5" /> Mark paper-traded
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">Typed fill price</Label>
          <Input value={fill} onChange={(e) => { setFill(e.target.value); clearReview(); }} placeholder="Broker fill" inputMode="decimal" />
        </div>
        <div>
          <Label className="text-xs">Quantity</Label>
          <Input value={qty} onChange={(e) => { setQty(e.target.value); clearReview(); }} placeholder="Qty" inputMode="decimal" />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs" htmlFor="rec-fees">Fees (optional)</Label>
        <Input
          id="rec-fees"
          value={fees}
          onChange={(e) => { setFees(e.target.value); clearReview(); }}
          placeholder="Brokerage / exchange fee"
          inputMode="decimal"
        />
        <p className="text-[11px] text-muted-foreground">
          Same fees field for idea, paper and filled. Filled trades book fees into cost; idea/paper keep them as reference only (no realised P&amp;L).
        </p>
      </div>
      {review ? <TradeReview preview={review} /> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" disabled={!!busy} onClick={() => void save("filled")}>
          <CheckCircle2 className="mr-1.5 size-3.5" /> {review ? "Confirm fill" : "Review fill"}
        </Button>
        {review ? (
          <Button type="button" size="sm" variant="ghost" disabled={!!busy} onClick={() => setReview(null)}>
            Back
          </Button>
        ) : null}
      </div>
    </div>
  );
}
