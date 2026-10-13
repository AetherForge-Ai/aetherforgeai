import { formatDisplayDate } from "@/lib/currency";

/**
 * Price field label. Editing the price, the date, or the asset clears the close stamp,
 * and the label falls back to "Price".
 */
export function shownTradePriceLabel(priceAsAt: string, priceDirty: boolean): string {
  if (priceDirty) return "Price";
  const when = priceAsAt ? formatDisplayDate(priceAsAt) : "";
  if (!when || when === "—") return "Price";
  return `Last close ${when}`;
}
