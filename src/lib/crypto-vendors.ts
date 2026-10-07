/**
 * One vendor-id map for crypto. CoinGecko ids and Yahoo symbols live here.
 *
 * ARB, TON and JUP do not use a guessed TICKER-USD symbol. Those Yahoo symbols
 * are different assets (JUP-USD is a micro-price token, not Jupiter).
 *
 * Owner hand-check before crypto projections are un-paused. Compare each live
 * USD print with CoinGecko, in this order:
 * BTC, ETH, SOL, BNB, XRP, ARB, TON, JUP, UNI, APT.
 */

export interface CryptoVendor {
  ticker: string;
  name: string;
  coingecko: string;
  yahoo: string;
}

export const CRYPTO_PROJECTION_HAND_CHECK = [
  "BTC",
  "ETH",
  "SOL",
  "BNB",
  "XRP",
  "ARB",
  "TON",
  "JUP",
  "UNI",
  "APT",
] as const;

const ROWS: CryptoVendor[] = [
  { ticker: "BTC", name: "Bitcoin", coingecko: "bitcoin", yahoo: "BTC-USD" },
  { ticker: "ETH", name: "Ethereum", coingecko: "ethereum", yahoo: "ETH-USD" },
  { ticker: "SOL", name: "Solana", coingecko: "solana", yahoo: "SOL-USD" },
  { ticker: "BNB", name: "BNB", coingecko: "binancecoin", yahoo: "BNB-USD" },
  { ticker: "XRP", name: "XRP", coingecko: "ripple", yahoo: "XRP-USD" },
  { ticker: "ADA", name: "Cardano", coingecko: "cardano", yahoo: "ADA-USD" },
  { ticker: "AVAX", name: "Avalanche", coingecko: "avalanche-2", yahoo: "AVAX-USD" },
  { ticker: "DOGE", name: "Dogecoin", coingecko: "dogecoin", yahoo: "DOGE-USD" },
  { ticker: "LINK", name: "Chainlink", coingecko: "chainlink", yahoo: "LINK-USD" },
  { ticker: "DOT", name: "Polkadot", coingecko: "polkadot", yahoo: "DOT-USD" },
  { ticker: "MATIC", name: "Polygon (POL)", coingecko: "polygon-ecosystem-token", yahoo: "MATIC-USD" },
  { ticker: "POL", name: "Polygon", coingecko: "polygon-ecosystem-token", yahoo: "POL-USD" },
  { ticker: "LTC", name: "Litecoin", coingecko: "litecoin", yahoo: "LTC-USD" },
  { ticker: "UNI", name: "Uniswap", coingecko: "uniswap", yahoo: "UNI-USD" },
  { ticker: "ATOM", name: "Cosmos", coingecko: "cosmos", yahoo: "ATOM-USD" },
  { ticker: "NEAR", name: "NEAR Protocol", coingecko: "near", yahoo: "NEAR-USD" },
  { ticker: "APT", name: "Aptos", coingecko: "aptos", yahoo: "APT-USD" },
  { ticker: "ARB", name: "Arbitrum", coingecko: "arbitrum", yahoo: "ARB11841-USD" },
  { ticker: "OP", name: "Optimism", coingecko: "optimism", yahoo: "OP-USD" },
  { ticker: "TON", name: "Toncoin", coingecko: "the-open-network", yahoo: "TON11419-USD" },
  { ticker: "JUP", name: "Jupiter", coingecko: "jupiter-exchange-solana", yahoo: "JUP29210-USD" },
];

export const CRYPTO_VENDORS: Record<string, CryptoVendor> = Object.fromEntries(ROWS.map((row) => [row.ticker, row]));

export function normalizeCryptoTicker(ticker: string): string {
  return (ticker || "").toUpperCase().replace(/-?USD[T]?$/, "").trim();
}

export function vendorFor(ticker: string): CryptoVendor | null {
  return CRYPTO_VENDORS[normalizeCryptoTicker(ticker)] ?? null;
}

/** Configured CoinGecko id. Unknown tickers are not guessed. */
export function coingeckoIdFor(ticker: string): string | null {
  return vendorFor(ticker)?.coingecko ?? null;
}

/**
 * Yahoo symbol. Configured names use the mapped symbol.
 * Anything else is a guessed TICKER-USD fallback and must not be published alone.
 */
export function yahooSymbolFor(ticker: string): { symbol: string; mapped: boolean } {
  const code = normalizeCryptoTicker(ticker);
  const row = CRYPTO_VENDORS[code];
  if (row) return { symbol: row.yahoo, mapped: true };
  return { symbol: `${code}-USD`, mapped: false };
}
