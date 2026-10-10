/**
 * How the Add panel and the sell form price a crypto row.
 * A known coin (UNI, PEPE) is not strict: the coin list may use Yahoo when
 * CoinGecko is quiet. An unknown extended id or a pool address stays strict
 * so a guessed ticker cannot replace that asset.
 */

/** Pinned DEX coins whose CoinGecko id is the one the Add panel sends. */
const LISTED_DEX_IDS: Record<string, string> = {
  PEPE: "pepe",
  UNI: "uniswap",
};

export function listedCryptoIsStrict(
  symbol: string,
  explicitId: string,
  remembered: string,
  knownCanonical: boolean
): boolean {
  const ticker = (symbol || "").trim().toUpperCase();
  const id = (explicitId || remembered || "").trim().toLowerCase();
  if (!id) return false;
  if (id.includes("0x") || id.length > 80) return true;
  if (knownCanonical) return false;
  if (LISTED_DEX_IDS[ticker] && LISTED_DEX_IDS[ticker] === id) return false;
  return true;
}

/** A live DEX search price wins. Otherwise the coin-list price the sell form uses. */
export function pickListedCryptoPrice(input: {
  market: string;
  dexPrice: number | null;
  coinListPrice: number | null;
}): number | null {
  const dex = input.dexPrice != null && input.dexPrice > 0 ? input.dexPrice : null;
  const list = input.coinListPrice != null && input.coinListPrice > 0 ? input.coinListPrice : null;
  if ((input.market || "").toLowerCase() === "dex") return dex ?? list;
  return list ?? dex;
}
