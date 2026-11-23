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
  // COIN-MAP-1: high-cap tickers that another token also prints.
  // Yahoo ARB-USD is ARbit (~0.000629), not Arbitrum (ARB11841-USD).
  // CoinPaprika jup-jupiter and Yahoo JUP-USD are a micro-cap Jupiter, not Jupiter Exchange.
  // Guessed UNI-USD / APT-USD are not Uniswap / Aptos. Short keys are aliases of the CoinGecko id.
  arbitrum: { gecko: "arbitrum", paprika: "arb-arbitrum", symbol: "ARB" },
  arb: { gecko: "arbitrum", paprika: "arb-arbitrum", symbol: "ARB" },
  "jupiter-exchange-solana": { gecko: "jupiter-exchange-solana", paprika: "jup-jupiter-exchange-token", symbol: "JUP" },
  jup: { gecko: "jupiter-exchange-solana", paprika: "jup-jupiter-exchange-token", symbol: "JUP" },
  uniswap: { gecko: "uniswap", paprika: "uni-uniswap", symbol: "UNI" },
  uni: { gecko: "uniswap", paprika: "uni-uniswap", symbol: "UNI" },
  aptos: { gecko: "aptos", paprika: "apt-aptos", symbol: "APT" },
  apt: { gecko: "aptos", paprika: "apt-aptos", symbol: "APT" },
  optimism: { gecko: "optimism", paprika: "op-optimism", symbol: "OP" },
  op: { gecko: "optimism", paprika: "op-optimism", symbol: "OP" },
  "the-open-network": { gecko: "the-open-network", paprika: "toncoin-the-open-network", symbol: "GRAM" },
  gram: { gecko: "the-open-network", paprika: "toncoin-the-open-network", symbol: "GRAM" },
  ton: { gecko: "the-open-network", paprika: "toncoin-the-open-network", symbol: "GRAM" },
  "polygon-ecosystem-token": { gecko: "polygon-ecosystem-token", paprika: "pol-polygon-ecosystem-token", symbol: "POL" },
  pol: { gecko: "polygon-ecosystem-token", paprika: "pol-polygon-ecosystem-token", symbol: "POL" },
  pepe: { gecko: "pepe", paprika: "pepe-pepe", symbol: "PEPE" },
  sui: { gecko: "sui", paprika: "sui-sui", symbol: "SUI" },
  "sei-network": { gecko: "sei-network", paprika: "sei-sei", symbol: "SEI" },
  sei: { gecko: "sei-network", paprika: "sei-sei", symbol: "SEI" },
  celestia: { gecko: "celestia", paprika: "tia-celestia", symbol: "TIA" },
  tia: { gecko: "celestia", paprika: "tia-celestia", symbol: "TIA" },
  cosmos: { gecko: "cosmos", paprika: "atom-cosmos", symbol: "ATOM" },
  atom: { gecko: "cosmos", paprika: "atom-cosmos", symbol: "ATOM" },
  filecoin: { gecko: "filecoin", paprika: "fil-filecoin", symbol: "FIL" },
  fil: { gecko: "filecoin", paprika: "fil-filecoin", symbol: "FIL" },
  "internet-computer": { gecko: "internet-computer", paprika: "icp-internet-computer", symbol: "ICP" },
  icp: { gecko: "internet-computer", paprika: "icp-internet-computer", symbol: "ICP" },
  "injective-protocol": { gecko: "injective-protocol", paprika: "inj-injective-protocol", symbol: "INJ" },
  inj: { gecko: "injective-protocol", paprika: "inj-injective-protocol", symbol: "INJ" },
  "render-token": { gecko: "render-token", paprika: "rndr-render-token", symbol: "RENDER" },
  render: { gecko: "render-token", paprika: "rndr-render-token", symbol: "RENDER" },
  "fetch-ai": { gecko: "fetch-ai", paprika: "fetch-ai", symbol: "FET" },
  fet: { gecko: "fetch-ai", paprika: "fetch-ai", symbol: "FET" },
  "worldcoin-wld": { gecko: "worldcoin-wld", paprika: "wld-worldcoin", symbol: "WLD" },
  wld: { gecko: "worldcoin-wld", paprika: "wld-worldcoin", symbol: "WLD" },
  bonk: { gecko: "bonk", paprika: "bonk-bonk", symbol: "BONK" },
  dogwifcoin: { gecko: "dogwifcoin", paprika: "wif-dogwifcoin", symbol: "WIF" },
  wif: { gecko: "dogwifcoin", paprika: "wif-dogwifcoin", symbol: "WIF" },
  "immutable-x": { gecko: "immutable-x", paprika: "imx-immutable-x", symbol: "IMX" },
  imx: { gecko: "immutable-x", paprika: "imx-immutable-x", symbol: "IMX" },
  blockstack: { gecko: "blockstack", paprika: "stx-stacks", symbol: "STX" },
  stx: { gecko: "blockstack", paprika: "stx-stacks", symbol: "STX" },
  thorchain: { gecko: "thorchain", paprika: "rune-thorchain", symbol: "RUNE" },
  rune: { gecko: "thorchain", paprika: "rune-thorchain", symbol: "RUNE" },
};
