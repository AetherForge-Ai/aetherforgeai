/**
 * Watchlist price row. The number and the freshness label come from the shared
 * quote print. Intel may fill a blank name. It never supplies the price.
 */

export type WatchlistPrintCurrency = "NZD" | "AUD" | "USD";

export interface WatchlistIntelFields {
  name?: string | null;
  price?: number | null;
  currency?: WatchlistPrintCurrency | null;
  change1d?: number | null;
}

export interface WatchlistQuotePrint {
  price: number;
  changePct: number | null;
  currency: WatchlistPrintCurrency;
  label: string | null;
}

export interface WatchlistShownPrint {
  name: string;
  price: number | null;
  currency: WatchlistPrintCurrency | null;
  changePct: number | null;
  label: string | null;
}

export function watchlistShouldFetchQuote(input: {
  intelPrice?: number | null;
  haveQuote: boolean;
  asked: boolean;
}): boolean {
  return !input.haveQuote && !input.asked;
}

export function watchlistShownPrint(input: {
  itemName: string;
  intel: WatchlistIntelFields | null;
  quote: WatchlistQuotePrint | null;
}): WatchlistShownPrint {
  const itemName = input.itemName.trim();
  const intelName = input.intel?.name?.trim() || "";
  const name = itemName || intelName;
  const quote = input.quote;
  if (!quote || !Number.isFinite(quote.price) || !(quote.price > 0)) {
    return { name, price: null, currency: null, changePct: null, label: null };
  }
  return {
    name,
    price: quote.price,
    currency: quote.currency,
    changePct: Number.isFinite(quote.changePct) ? quote.changePct : null,
    label: quote.label,
  };
}
