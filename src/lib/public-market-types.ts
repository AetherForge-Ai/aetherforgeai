export const MARKET_INDEX_PAGE = 50;
/** First rows written into the /markets document. The browser loads the rest. */
export const PUBLIC_SEED_ROWS = 25;

export interface PublicPriceRow {
  /** b38 H-1: this row's own quote is over 15 minutes old; the table shows "delayed". */
  delayed?: boolean;
  symbol: string;
  name: string;
  price: string;
  change: string;
  href: string;
  /** Numeric USD price when this row is a crypto or DEX print. */
  usd?: number;
  changePct?: number;
  /** b6 H-2: numeric stock print so the seeded table keeps price, high and low. */
  value?: number;
  changeAbs?: number;
  dayHigh?: number | null;
  dayLow?: number | null;
  /** Coin slug for /markets/crypto/[id]. */
  quoteId?: string;
  /** Vendor or saved-print label. Empty when this row has no price. */
  source?: string;
  /** Includes the words "as of" for this row. */
  asOf?: string;
  /** b46 H-1 (b): this row's own quote time (crypto and DEX), so "delayed" is re-evaluated when the
   * response is built and again when the browser renders, never frozen at cache time. */
  quotedAt?: string | null;
  /** Native chain or platform for a coin. */
  blockchain?: string;
  /** Server-rendered moves. An em dash means the feed did not send that figure. */
  change1h?: string;
  change7d?: string;
  supply?: string;
  /** DEX name for a token row. */
  dex?: string;
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
