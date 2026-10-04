/**
 * Paper buy and sell of a name from the extended crypto or DEX list.
 * Nothing is sent to an exchange. A missing live price is refused.
 */

export interface ListedName {
  symbol: string;
  name: string;
  /** CoinGecko id when the row came from that list. */
  id?: string;
  price: number | null;
  list: "top400" | "dex";
}

export interface PaperBook {
  cashNZD: number;
  holdings: Record<string, { name: string; shares: number; price: number | null }>;
}

export interface PaperTradeResult {
  ok: boolean;
  error?: string;
  book: PaperBook;
  ticker?: string;
  side?: "buy" | "sell";
  shares?: number;
}

function round6(n: number): number {
  return Math.round((n + Number.EPSILON) * 1e6) / 1e6;
}

export function recordListedTrade(
  book: PaperBook,
  input: { side: "buy" | "sell"; listing: ListedName; quantity: number }
): PaperTradeResult {
  const ticker = input.listing.symbol.trim().toUpperCase();
  const quantity = input.quantity;
  if (!ticker) return { ok: false, error: "Ticker is required", book };
  if (!(quantity > 0)) return { ok: false, error: "Quantity must be greater than 0", book };
  const price = input.listing.price;
  if (!(price != null && price > 0)) {
    return { ok: false, error: `${ticker} live price unavailable`, book };
  }
  const held = book.holdings[ticker];
  if (input.side === "sell") {
    const have = held?.shares || 0;
    if (quantity > have + 1e-9) {
      return { ok: false, error: `You only hold ${have} of ${ticker}`, book };
    }
    const left = round6(have - quantity);
    const holdings = { ...book.holdings };
    if (left <= 1e-9) delete holdings[ticker];
    else holdings[ticker] = { name: held?.name || input.listing.name, shares: left, price };
    return {
      ok: true,
      book: { cashNZD: book.cashNZD, holdings },
      ticker,
      side: "sell",
      shares: left > 1e-9 ? left : 0,
    };
  }
  const nextShares = round6((held?.shares || 0) + quantity);
  return {
    ok: true,
    book: {
      cashNZD: book.cashNZD,
      holdings: {
        ...book.holdings,
        [ticker]: { name: input.listing.name || held?.name || ticker, shares: nextShares, price },
      },
    },
    ticker,
    side: "buy",
    shares: nextShares,
  };
}

/** Names already on the book stay recordable even when they are not on the extended list. */
export function existingNameStillRecordable(symbol: string, known: string[]): boolean {
  const t = symbol.trim().toUpperCase();
  return known.map((k) => k.toUpperCase()).includes(t);
}
