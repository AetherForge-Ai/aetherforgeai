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
  EOS: "EOS",
  MINA: "Mina Protocol",
  AXS: "Axie Infinity",
  KSM: "Kusama",
  FLOW: "Flow",
  ICP: "Internet Computer",
  AAVE: "Aave",
  ZIL: "Zilliqa",
  ARKM: "Arkham",
  FET: "Artificial Superintelligence Alliance",
  CRV: "Curve DAO Token",
  SNX: "Synthetix",
  YFI: "yearn.finance",
  ANKR: "Ankr",
  FIL: "Filecoin",
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
};

export function coinDisplayName(symbol: string, feedName?: string | null): string {
  const ticker = (symbol || "").trim().toUpperCase();
  const fed = (feedName || "").trim();
  if (fed && fed.toUpperCase() !== ticker) return fed;
  return COINGECKO_NAMES[ticker] || CRYPTO_DISPLAY_NAMES[ticker] || fed || ticker;
}
