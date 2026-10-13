import { formatMoney } from "@/lib/currency";

export const METAL_SPOT_DOWN = "Spot feed did not return a price for this metal.";

export interface ShownMetalSpot {
  text: string;
  reason: string | null;
  live: boolean;
}

/**
 * The metal panel shows a spot price only when the feed answered.
 * A purchase price is the cost, not a stand-in for spot.
 */
export function shownMetalSpot(live: boolean, nzdPerOz: number | null | undefined): ShownMetalSpot {
  const price = Number(nzdPerOz);
  if (live && Number.isFinite(price) && price > 0) {
    return { text: formatMoney(price, "NZD"), reason: null, live: true };
  }
  return { text: "—", reason: METAL_SPOT_DOWN, live: false };
}
