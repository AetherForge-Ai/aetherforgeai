"use client";

import { formatMoney } from "@/lib/currency";
import { formatNumber } from "@/lib/portfolio";
import type { TradePreview } from "@/lib/trade-preview";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="tnum text-right font-medium">{value}</span>
    </div>
  );
}

/** Review step shown before a buy or sell is written. Confirm lives in the dialog footer. */
export function TradeReview({ preview }: { preview: TradePreview }) {
  const side = preview.side === "buy" ? "Buy" : "Sell";
  const native = preview.currency;
  const same = native === "NZD";
  const price =
    same
      ? formatMoney(preview.priceNative, "NZD")
      : `${formatMoney(preview.priceNative, native)} · ${formatMoney(preview.priceNzd, "NZD")}`;
  const fee =
    preview.feeNative > 0
      ? same
        ? formatMoney(preview.feeNative, "NZD")
        : `${formatMoney(preview.feeNative, native)} · ${formatMoney(preview.feeNzd, "NZD")}`
      : "No fee";
  const total =
    same
      ? formatMoney(preview.totalNative, "NZD")
      : `${formatMoney(preview.totalNative, native)} · ${formatMoney(preview.totalNzd, "NZD")}`;
  return (
    <div className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-4" data-testid="trade-review">
      <div>
        <p className="font-display text-base font-bold">Review {side.toLowerCase()}</p>
        <p className="text-xs text-muted-foreground">
          Nothing is written until you confirm. Back returns to the form.
        </p>
      </div>
      <div className="space-y-2">
        <Row label="Asset" value={preview.assetName && preview.assetName !== preview.asset ? `${preview.asset} · ${preview.assetName}` : preview.asset} />
        <Row label="Side" value={side} />
        <Row label="Quantity" value={formatNumber(preview.quantity)} />
        <Row label="Price" value={price} />
        <Row label="Fee" value={fee} />
        <Row label="Total" value={total} />
        <Row label="Cash after" value={formatMoney(preview.resultingCashNzd, "NZD")} />
      </div>
    </div>
  );
}
