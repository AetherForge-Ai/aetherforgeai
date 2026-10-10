export const MARKET_INDEX_PAGE = 50;

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
}

export interface PublicPriceTab {
  id: string;
  title: string;
  /** Includes the words "as of" when a vendor time exists. */
  asOf: string;
  rows: PublicPriceRow[];
}

export interface PublicMarketIndex {
  tabs: PublicPriceTab[];
  priceRowCount: number;
}
