/**
 * Coin names for the markets table and the tape.
 * A feed that repeats the ticker is replaced with the CoinGecko name.
 * A feed that already has a distinct name is kept.
 */

import { CRYPTO_DISPLAY_NAMES } from "@/lib/crypto-ids";

/** Names CoinGecko publishes for coins that often arrive as the raw ticker. */
const COINGECKO_NAMES: Record<string, string> = {
  BAT: "Basic Attention Token",
  STRK: "Starknet",
  GALA: "Gala",
  // CoinGecko's own name is "EOS", which is the ticker. A distinct label is the name.
  EOS: "EOS Network",
  THETA: "Theta Network",
  APE: "ApeCoin",
  WLD: "Worldcoin",
  ENJ: "Enjin Coin",
  IOTA: "IOTA",
  SHIB: "Shiba Inu",
  PEPE: "Pepe",
  FLOKI: "FLOKI",
  BONK: "Bonk",
  NEAR: "NEAR Protocol",
  OP: "Optimism",
  DOT: "Polkadot",
  MINA: "Mina Protocol",
  AXS: "Axie Infinity",
  KSM: "Kusama",
  FLOW: "Flow",
  ICP: "Internet Computer",
  AAVE: "Aave",
  ZIL: "Zilliqa",
  FET: "Artificial Superintelligence Alliance",
  CRV: "Curve DAO",
  SNX: "Synthetix",
  YFI: "yearn.finance",
  ANKR: "Ankr",
  FIL: "Filecoin",
  ARKM: "Arkham",
  TRX: "TRON",
  INJ: "Injective",
  TIA: "Celestia",
  ALGO: "Algorand",
  XLM: "Stellar",
  BCH: "Bitcoin Cash",
  HBAR: "Hedera",
  JTO: "Jito",
  SEI: "Sei",
  ONDO: "Ondo",
  NEO: "Neo",
  ROSE: "Oasis",
  MKR: "Maker",
  USDT: "Tether",
  SUI: "Sui",
  ETC: "Ethereum Classic",
  VET: "VeChain",
  RENDER: "Render",
  IMX: "Immutable",
  STX: "Stacks",
  GRT: "The Graph",
  RUNE: "THORChain",
  EGLD: "MultiversX",
  XTZ: "Tezos",
  SAND: "The Sandbox",
  MANA: "Decentraland",
  QNT: "Quant",
  LDO: "Lido DAO",
  COMP: "Compound",
  DYDX: "dYdX",
  ENS: "Ethereum Name Service",
  CHZ: "Chiliz",
  ZEC: "Zcash",
  CAKE: "PancakeSwap",
  KAVA: "Kava",
  GMX: "GMX",
  LRC: "Loopring",
  DASH: "Dash",
  SUSHI: "Sushi",
  CELO: "Celo",
  SKL: "SKALE",
  STORJ: "Storj",
  AUDIO: "Audius",
  MASK: "Mask Network",
  API3: "API3",
  BAND: "Band Protocol",
  BAL: "Balancer",
  "1INCH": "1inch",
  LUNC: "Terra Classic",
  WIF: "dogwifhat",
  PENDLE: "Pendle",
  PYTH: "Pyth Network",
  BLUR: "Blur",
};

/**
 * CoinGecko's own name is the ticker. Do not replace these with a longer label.
 * pull-check:v3-tier1a-2026-10-12
 */
export const SYMBOL_IS_OFFICIAL_NAME = new Set(["BNB", "XRP", "USDC"]);

export function coinDisplayName(symbol: string, feedName?: string | null): string {
  const ticker = (symbol || "").trim().toUpperCase();
  const fed = (feedName || "").trim();
  if (SYMBOL_IS_OFFICIAL_NAME.has(ticker) && (!fed || fed.toUpperCase() === ticker)) return ticker;
  if (fed && fed.toUpperCase() !== ticker) return fed;
  return COINGECKO_NAMES[ticker] || CRYPTO_DISPLAY_NAMES[ticker] || fed || ticker;
}
