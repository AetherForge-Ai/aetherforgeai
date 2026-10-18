/**
 * b29 H-15: one list of news sources, shared by /api/news (which drops anything not on it) and
 * /trust "Where the news comes from" (which renders it). A card's source can only be a name on
 * this list, so /trust always names every source a reader can see.
 */
export const HOST_PUBLISHER: Array<[string, string]> = [
  ["bls.gov", "U.S. Bureau of Labor Statistics"],
  ["rbnz.govt.nz", "Reserve Bank of New Zealand"],
  ["bloomberg.com", "Bloomberg"],
  ["fonterra.com", "Fonterra"],
  ["fphcare.com", "Fisher & Paykel Healthcare"],
  ["asx.com.au", "ASX"],
  ["commbank.com.au", "Commonwealth Bank"],
  ["woodside.com", "Woodside Energy"],
  ["nvidia.com", "NVIDIA"],
  ["morningstar.com", "Morningstar"],
  ["marketwatch.com", "MarketWatch"],
  ["aucklandairport.co.nz", "Auckland Airport"],
  ["coindesk.com", "CoinDesk"],
  ["theblock.co", "The Block"],
  ["blockworks.co", "Blockworks"],
  ["glassnode.com", "Glassnode"],
  ["reuters.com", "Reuters"],
  ["kaiko.com", "Kaiko"],
  ["l2beat.com", "L2Beat"],
  ["cryptoquant.com", "CryptoQuant"],
  ["deribit.com", "Deribit"],
  ["messari.io", "Messari"],
  ["cointelegraph.com", "Cointelegraph"],
  ["finance.yahoo.com", "Yahoo Finance"],
  ["yahoo.com", "Yahoo Finance"],
  ["rnz.co.nz", "RNZ"],
  ["businessdesk.co.nz", "BusinessDesk"],
  ["proactiveinvestors.com", "Proactive Investors"],
  ["proactiveinvestors.com.au", "Proactive Investors"],
  ["beincrypto.com", "BeInCrypto"],
  ["decrypt.co", "Decrypt"],
  ["twelvedata.com", "Twelve Data"],
  ["bbc.com", "BBC"],
  ["bbc.co.uk", "BBC"],
];

/** The feeds we pull, with their delay. */
export const NEWS_FEEDS = [
  { source: "RNZ (Radio New Zealand)", what: "business RSS headlines", delay: "shown up to 15 minutes after RNZ publishes" },
  { source: "BusinessDesk", what: "NZ business RSS headlines", delay: "shown up to 15 minutes after BusinessDesk publishes" },
  { source: "Reserve Bank of New Zealand (RBNZ)", what: "the OCR (cash rate) card", delay: "copied from the RBNZ page by hand after each decision, so it can lag the announcement by days" },
  { source: "Yahoo Finance", what: "ASX and US headline feeds and searches, which can include articles by the third-party publishers listed below", delay: "shown up to 15 minutes after Yahoo publishes" },
  { source: "BBC Business", what: "global business RSS headlines (filtered to NZ/AU-relevant items)", delay: "shown up to 15 minutes after BBC publishes" },
  { source: "Twelve Data", what: "US company press releases", delay: "shown up to 15 minutes after Twelve Data lists them" },
] as const;

/** Publisher names a card can carry (deduplicated, as printed on /trust). */
export function listedNewsPublishers(): string[] {
  return [...new Set(HOST_PUBLISHER.map(([, name]) => name))];
}

const LISTED = new Set(listedNewsPublishers().map((n) => n.toLowerCase()));
for (const feed of NEWS_FEEDS) LISTED.add(feed.source.toLowerCase());
LISTED.add("reserve bank of new zealand");

export function isListedNewsSource(source: string | null | undefined): boolean {
  return !!source && LISTED.has(source.trim().toLowerCase());
}
