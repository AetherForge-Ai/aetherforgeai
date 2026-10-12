/**
 * Symbol check for a broker file.
 * A code is known only when it is already on the stock list, the crypto list, or the metals list.
 * Nothing here renames a ticker.
 */

import { CANONICAL_CRYPTO_IDS } from "@/lib/crypto-ids";
import { lookupTicker } from "@/lib/market";
import { findListing } from "@/lib/stock-catalog";

const METALS = new Set(["GOLD", "SILVER"]);

export type ImportAssetClass = "stock" | "crypto" | "metal";

export function knownImportSymbol(raw: string): boolean {
  const ticker = raw.trim().toUpperCase();
  if (!ticker) return false;
  if (METALS.has(ticker)) return true;
  if (CANONICAL_CRYPTO_IDS[ticker]) return true;
  if (lookupTicker(ticker)) return true;
  return findListing(ticker) != null;
}

export function assetClassForSymbol(raw: string): ImportAssetClass {
  const ticker = raw.trim().toUpperCase();
  if (METALS.has(ticker)) return "metal";
  if (CANONICAL_CRYPTO_IDS[ticker]) return "crypto";
  return "stock";
}
