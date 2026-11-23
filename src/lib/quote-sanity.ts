/**
 * Guard a quote before it prices a trade or turns a cash amount into a quantity.
 * A print more than 90% below, or more than 10× above, the last good / reference
 * price is refused. The caller records nothing and asks for a typed price.
 */

/** Reject a quote below this fraction of the reference (a drop of more than 90%). */
export const TRADE_QUOTE_FLOOR = 0.1;

/** Reject a quote above this multiple of the reference (a rise of more than 10×). */
export const TRADE_QUOTE_CAP = 10;

export const PRICE_UNAVAILABLE_MANUAL = "Price unavailable, enter price manually.";

export interface TradeQuoteGuard {
  ok: boolean;
  price: number | null;
  message: string | null;
}

function positive(value: number | null | undefined): number | null {
  const n = Number(value);
  return n > 0 && Number.isFinite(n) ? n : null;
}

/** True when `quote` is more than 90% below or more than 10× above `reference`. */
export function quoteDisagreesWithReference(quote: number, reference: number): boolean {
  const q = positive(quote);
  const ref = positive(reference);
  if (q == null || ref == null) return true;
  return q < ref * TRADE_QUOTE_FLOOR || q > ref * TRADE_QUOTE_CAP;
}

/**
 * Accept a quote, or refuse it.
 * A missing reference cannot be judged, so a positive quote is kept.
 * A missing quote is refused.
 */
export function guardTradeQuote(quote: number | null | undefined, reference: number | null | undefined): TradeQuoteGuard {
  const q = positive(quote);
  if (q == null) return { ok: false, price: null, message: PRICE_UNAVAILABLE_MANUAL };
  const ref = positive(reference);
  if (ref == null) return { ok: true, price: q, message: null };
  if (quoteDisagreesWithReference(q, ref)) return { ok: false, price: null, message: PRICE_UNAVAILABLE_MANUAL };
  return { ok: true, price: q, message: null };
}

export type QuotedQuantity =
  | { ok: true; quantity: number; price: number }
  | { ok: false; quantity: null; price: null; message: string };

/**
 * Units for a cash amount at a quote.
 * A quote that fails the reference guard does not produce a quantity.
 */
export function quantityFromQuotedAmount(
  amount: number,
  quote: number | null | undefined,
  reference: number | null | undefined
): QuotedQuantity {
  const guarded = guardTradeQuote(quote, reference);
  if (!guarded.ok || guarded.price == null) {
    return { ok: false, quantity: null, price: null, message: guarded.message || PRICE_UNAVAILABLE_MANUAL };
  }
  const cash = positive(amount);
  if (cash == null) return { ok: false, quantity: null, price: null, message: PRICE_UNAVAILABLE_MANUAL };
  return { ok: true, quantity: cash / guarded.price, price: guarded.price };
}
