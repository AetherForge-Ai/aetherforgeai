import { formatDisplayDate, formatDisplayDateTime } from "@/lib/currency";
import { closeLabelFor, type EquityVenue } from "@/lib/market-freshness";

export type TradePriceSession = "open" | "closed" | "";

/**
 * Price field label. Editing the price, the date, or the asset clears the close stamp,
 * and the label falls back to "Price". An open exchange names the latest print and its time.
 * "Last close" is only for a shut session.
 */
export function shownTradePriceLabel(
  priceAsAt: string,
  priceDirty: boolean,
  session: TradePriceSession = "",
  venue?: EquityVenue | null,
  now = new Date()
): string {
  if (priceDirty) return "Price";
  if (!priceAsAt) return "Price";
  if (session === "open") {
    const wall = formatDisplayDateTime(priceAsAt);
    return wall === "—" ? "Latest price" : `Latest price ${wall}`;
  }
  if (session === "closed" && venue) return closeLabelFor(venue, priceAsAt, now);
  const when = priceAsAt ? formatDisplayDate(priceAsAt) : "";
  if (!when || when === "—") return "Price";
  return `Last close ${when}`;
}

/** Helper under the price field. Hidden once the member types over the filled price. */
export function tradePriceHint(input: {
  priceDirty: boolean;
  session: TradePriceSession;
  quotedAt: string;
  venue?: EquityVenue | null;
  now?: Date;
}): string {
  if (input.priceDirty) return "";
  if (input.session === "open") {
    const wall = input.quotedAt ? formatDisplayDateTime(input.quotedAt) : "";
    return wall && wall !== "—" ? `Latest price ${wall} filled in` : "Latest price filled in";
  }
  if (input.session === "closed") {
    if (input.venue) return `${closeLabelFor(input.venue, input.quotedAt, input.now)} filled in`;
    const when = input.quotedAt ? formatDisplayDate(input.quotedAt) : "";
    return when && when !== "—" ? `Last close ${when} filled in` : "Last close filled in";
  }
  return "";
}
