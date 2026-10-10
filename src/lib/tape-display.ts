/**
 * Currency labels for the public price tape.
 * Native mode prints each item in its own currency.
 * NZ$ mode converts with the live "1 unit → NZD" table and shows that rate to 4dp.
 */

import {
  formatFxInput,
  formatUnitPrice,
  nativeToNzd,
  type CurrencyCode,
  type FxRatesToNZD,
} from "@/lib/currency";

export type TapeDisplay = "native" | "NZD";

function asCurrency(code: string): CurrencyCode {
  const upper = code.toUpperCase();
  if (upper === "NZD" || upper === "AUD" || upper === "USD") return upper;
  return "USD";
}

export function formatTapeItem(
  quote: { price: number; currency?: string | null },
  display: TapeDisplay,
  rates: FxRatesToNZD,
): string {
  const currency = asCurrency(quote.currency || "USD");
  if (display === "NZD" && currency !== "NZD") {
    return formatUnitPrice(nativeToNzd(quote.price, currency, rates), "NZD");
  }
  return formatUnitPrice(quote.price, currency);
}

/** FX line beside the NZ$ toggle. Four decimal places. */
export function fxRateLine(rates: FxRatesToNZD): string {
  return `1 USD = NZ$${formatFxInput(rates.USD)} · 1 AUD = NZ$${formatFxInput(rates.AUD)}`;
}
