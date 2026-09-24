/**
 * Canonical crypto ID map — USD per 1 whole token.
 *
 * Tickers must resolve to CoinGecko (or Swyftx) IDs that quote whole-token USD.
 * Never treat micro-unit or wrong-asset IDs as the spot for fill validation.
 */

export const CANONICAL_CRYPTO_IDS: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  SOL: "solana",
  BNB: "binancecoin",
  XRP: "ripple",
  ADA: "cardano",
  AVAX: "avalanche-2",
  DOGE: "dogecoin",
  LINK: "chainlink",
  DOT: "polkadot",
  MATIC: "polygon-ecosystem-token",
  POL: "polygon-ecosystem-token",
  LTC: "litecoin",
  UNI: "uniswap",
  ATOM: "cosmos",
  NEAR: "near",
  APT: "aptos",
  ARB: "arbitrum",
  OP: "optimism",
  JUP: "jupiter-exchange-solana",
};

export const CRYPTO_DISPLAY_NAMES: Record<string, string> = {
  BTC: "Bitcoin",
  ETH: "Ethereum",
  SOL: "Solana",
  BNB: "BNB",
  XRP: "XRP",
  ADA: "Cardano",
  AVAX: "Avalanche",
  DOGE: "Dogecoin",
  LINK: "Chainlink",
  DOT: "Polkadot",
  MATIC: "Polygon (POL)",
  POL: "Polygon",
  LTC: "Litecoin",
  UNI: "Uniswap",
  ATOM: "Cosmos",
  NEAR: "NEAR Protocol",
  APT: "Aptos",
  ARB: "Arbitrum",
  OP: "Optimism",
  JUP: "Jupiter",
};

/** Normalize a crypto ticker and return its canonical CoinGecko id. */
export function canonicalCryptoId(ticker: string): string {
  const t = (ticker || "").toUpperCase().replace(/-?USD[T]?$/, "").trim();
  return CANONICAL_CRYPTO_IDS[t] ?? t.toLowerCase();
}

export function normalizeCryptoTicker(ticker: string): string {
  return (ticker || "").toUpperCase().replace(/-?USD[T]?$/, "").trim();
}
