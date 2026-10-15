/**
 * H-1: one shared quote print per symbol for every view in this server
 * instance (header ticker, tape, /markets, stock pages, watchlist and the
 * trade drawer). Whichever Yahoo path fetches first writes the print; the
 * other paths reuse that price and change for the TTL, so one share never
 * shows two prices. Rounded to the display precision once, here.
 */
export const SHARED_QUOTE_TTL_MS = 60_000;

export interface SharedPrint {
  price: number;
  changePct: number;
  quotedAt?: string;
  at: number;
}

const STORE = new Map<string, SharedPrint>();

/** Display precision: 2 dp from 1 up; 6 significant figures below 1 (AIR.NZ 0.385, small coins). */
export function roundQuotePrice(price: number): number {
  if (!Number.isFinite(price)) return price;
  if (Math.abs(price) < 1) return Number(price.toPrecision(6));
  return Math.round((price + Number.EPSILON) * 100) / 100;
}

export function readSharedPrint(symbol: string, now = Date.now()): SharedPrint | null {
  const hit = STORE.get(symbol.toUpperCase());
  return hit && now - hit.at <= SHARED_QUOTE_TTL_MS ? hit : null;
}

/** First fresh writer wins; a later write in the TTL returns the stored print. */
export function shareQuotePrint(symbol: string, print: Omit<SharedPrint, "at">, now = Date.now()): SharedPrint {
  const existing = readSharedPrint(symbol, now);
  if (existing) return existing;
  const stored = { ...print, price: roundQuotePrice(print.price), at: now };
  STORE.set(symbol.toUpperCase(), stored);
  return stored;
}

export function clearSharedPrints(): void {
  STORE.clear();
}
