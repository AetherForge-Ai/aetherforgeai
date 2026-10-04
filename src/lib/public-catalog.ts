/**
 * Oct 2026 public Starter and Pro prices. Amounts are whole cents in NZD.
 * Prices are immutable: never edit unit_amount on an existing Price.
 * Ultimate is not in this list and must not get a self-serve price.
 */

export const PUBLIC_CATALOG = "2026-10-public";

export type PublicCatalogKey =
  | "starter_monthly"
  | "starter_yearly"
  | "pro_monthly"
  | "pro_yearly";

export interface PublicPriceSlot {
  key: PublicCatalogKey;
  /** Existing Price on the product. Used only to find that product. Not edited. */
  retiredPriceId: string;
  unitAmount: number;
  interval: "month" | "year";
  tickerLimit: string;
  botAccess: "single" | "both";
}

export const PUBLIC_PRICE_SLOTS: readonly PublicPriceSlot[] = [
  {
    key: "starter_monthly",
    retiredPriceId: "price_1TsjfH9sOmzarzYkYpuvCfuA",
    unitAmount: 1600,
    interval: "month",
    tickerLimit: "25",
    botAccess: "single",
  },
  {
    key: "starter_yearly",
    retiredPriceId: "price_1TsjfH9sOmzarzYkj43Mf2Zh",
    unitAmount: 16000,
    interval: "year",
    tickerLimit: "25",
    botAccess: "single",
  },
  {
    key: "pro_monthly",
    retiredPriceId: "price_1TsjfI9sOmzarzYkiDEzedgi",
    unitAmount: 4900,
    interval: "month",
    tickerLimit: "75",
    botAccess: "both",
  },
  {
    key: "pro_yearly",
    retiredPriceId: "price_1TsjfI9sOmzarzYkyyURWr4E",
    unitAmount: 49000,
    interval: "year",
    tickerLimit: "75",
    botAccess: "both",
  },
];

export function publicPriceSlot(key?: string | null): PublicPriceSlot | undefined {
  return PUBLIC_PRICE_SLOTS.find((slot) => slot.key === key);
}
