export const MARKET_INDEX_PAGE = 50;
/** Rows embedded in the /markets document. The browser loads the rest. */
export const PUBLIC_SEED_ROWS = 12;

export interface PublicPriceRow {
  symbol: string;
  name: string;
  price: string;
  change: string;
  href: string;
  /** Numeric USD price when this row is a crypto or DEX print. */
  usd?: number;
  changePct?: number;
  /** Coin slug for /markets/crypto/[id]. */
  quoteId?: string;
  /** Vendor or saved-print label. Empty when this row has no price. */
  source?: string;
  /** Includes the words "as of" for this row. */
  asOf?: string;
}

export interface PublicPriceTab {
  id: string;
  title: string;
  /** Includes the words "as of" when a vendor time exists. */
  asOf: string;
  /** "Showing N of M listed" for a stock board. */
  coverage?: string;
  note?: string;
  /** Listings on this page whose price was not in the response. */
  footnote?: string;
  rows: PublicPriceRow[];
}

export interface PublicMarketIndex {
  tabs: PublicPriceTab[];
  priceRowCount: number;
}
