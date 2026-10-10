export const MARKET_INDEX_PAGE = 50;

export interface PublicPriceRow {
  symbol: string;
  name: string;
  price: string;
  change: string;
  href: string;
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
  rows: PublicPriceRow[];
}

export interface PublicMarketIndex {
  tabs: PublicPriceTab[];
  priceRowCount: number;
}
