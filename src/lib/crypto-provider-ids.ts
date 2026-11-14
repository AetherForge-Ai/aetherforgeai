/**
 * b29 G-17: cross-provider id map. /markets links slugs from both CoinGecko and CoinPaprika lists,
 * and the six empty pages (bitcoin-cash, near-protocol, rain-protocol, stellar, tron, zcash) were
 * slugs the depth lookup could not resolve: CoinGecko knows NEAR as "near" (not "near-protocol")
 * and has no "rain-protocol" id, and the CoinPaprika search fallback called /v1/search without the
 * trailing slash (301, empty). Each id below was checked against the provider (19 Oct 2026):
 * CoinPaprika /v1/tickers/<id> 200; CoinGecko /coins/markets?ids=<id> returns the coin.
 *
 * A slug whose CoinGecko id differs from the slug is an alias. The coin page keeps one URL,
 * the CoinGecko id, and the other slugs redirect there.
 */

export interface CrossProviderIds {
  gecko: string | null;
  paprika: string;
  symbol: string;
}

export const CROSS_PROVIDER_IDS: Record<string, CrossProviderIds> = {
  tether: { gecko: "tether", paprika: "usdt-tether", symbol: "USDT" },
  "bitcoin-cash": { gecko: "bitcoin-cash", paprika: "bch-bitcoin-cash", symbol: "BCH" },
  "near-protocol": { gecko: "near", paprika: "near-near-protocol", symbol: "NEAR" },
  near: { gecko: "near", paprika: "near-near-protocol", symbol: "NEAR" },
  "rain-protocol": { gecko: null, paprika: "rain-rain-protocol", symbol: "RAIN" },
  stellar: { gecko: "stellar", paprika: "xlm-stellar", symbol: "XLM" },
  tron: { gecko: "tron", paprika: "trx-tron", symbol: "TRX" },
  zcash: { gecko: "zcash", paprika: "zec-zcash", symbol: "ZEC" },
  // b30 G-17: 1H/30D were empty signed in. Checked 19 Oct 2026: CoinGecko ids "whitebit" and
  // "leo-token"; CoinPaprika /v1/tickers/wbt-whitebit and /leo-leo-token both 200.
  whitebit: { gecko: "whitebit", paprika: "wbt-whitebit", symbol: "WBT" },
  "leo-token": { gecko: "leo-token", paprika: "leo-leo-token", symbol: "LEO" },
};
