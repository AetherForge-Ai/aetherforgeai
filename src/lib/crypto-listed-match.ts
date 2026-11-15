/**
 * Snapshot and quote identity for one coin.
 * A ticker is not an id. ARB, JUP, UNI and APT each share a symbol with another token.
 * An unknown or ambiguous id returns no row, so it cannot borrow that other price.
 */

import { CROSS_PROVIDER_IDS } from "@/lib/crypto-provider-ids";
import { coingeckoIdFor, normalizeCryptoTicker } from "@/lib/crypto-vendors";

export interface ListedIdentity {
  id: string;
  symbol: string;
}

/** Tickers whose guessed symbol matches a different asset. */
export const COLLISION_TICKERS = new Set([
  "ARB",
  "JUP",
  "UNI",
  "APT",
  "OP",
  "GRAM",
  "TON",
  "POL",
  "PEPE",
  "SUI",
  "SEI",
  "TIA",
  "ATOM",
  "FIL",
  "ICP",
  "INJ",
  "RENDER",
  "FET",
  "WLD",
  "BONK",
  "WIF",
  "IMX",
  "STX",
  "RUNE",
  "NEAR",
]);

function slugKey(value: string | null | undefined): string {
  return (value || "").trim().toLowerCase();
}

function tickerCode(ticker: string): string {
  return normalizeCryptoTicker(ticker);
}

/** CoinGecko id for a pinned or vendor ticker. Unknown tickers are not guessed. */
export function canonicalGeckoForTicker(ticker: string): string | null {
  const code = tickerCode(ticker);
  if (!code) return null;
  for (const row of Object.values(CROSS_PROVIDER_IDS)) {
    if (row.symbol === code && row.gecko) return row.gecko;
  }
  return coingeckoIdFor(code);
}

/** CoinPaprika id for a pinned ticker. Null when this symbol is not pinned. */
export function paprikaIdForSymbol(ticker: string): string | null {
  const code = tickerCode(ticker);
  if (!code) return null;
  for (const row of Object.values(CROSS_PROVIDER_IDS)) {
    if (row.symbol === code && row.paprika) return row.paprika;
  }
  return null;
}

/**
 * Ids that are this slug or its mapped CoinGecko / CoinPaprika id.
 * A shared ticker is not an id.
 */
export function listedIdsForSlug(slug: string): Set<string> {
  const ids = new Set<string>();
  const add = (value: string | null | undefined) => {
    const key = slugKey(value);
    if (key) ids.add(key);
  };
  const raw = slugKey(slug);
  add(raw);
  if (!raw) return ids;
  const direct = CROSS_PROVIDER_IDS[raw];
  if (direct) {
    add(direct.gecko);
    add(direct.paprika);
  }
  for (const [key, row] of Object.entries(CROSS_PROVIDER_IDS)) {
    if (key === raw || row.gecko === raw || row.paprika === raw) {
      add(key);
      add(row.gecko);
      add(row.paprika);
    }
  }
  const gecko = canonicalGeckoForTicker(raw);
  if (gecko) add(gecko);
  const paprika = paprikaIdForSymbol(raw);
  if (paprika) add(paprika);
  return ids;
}

/**
 * Ids that are the canonical asset for this ticker.
 * Null when the ticker is not collision-pinned.
 * Aliases such as MATIC are not rewritten here: the caller asked for that symbol.
 */
export function collisionIdsForTicker(ticker: string): Set<string> | null {
  const raw = (ticker || "").trim().toUpperCase();
  if (!COLLISION_TICKERS.has(raw)) return null;
  const ids = listedIdsForSlug(raw);
  return ids.size ? ids : null;
}

/**
 * One snapshot row for a coin page slug.
 * Match the slug or its mapped provider id only. Never a ticker.
 * Two rows for the same id set prefer the CoinGecko id. Otherwise no row.
 */
export function findListedCoin<T extends ListedIdentity>(coins: T[] | undefined, slug: string): T | null {
  if (!coins?.length) return null;
  const ids = listedIdsForSlug(slug);
  const hits = coins.filter((coin) => ids.has(slugKey(coin.id)));
  if (hits.length === 1) return hits[0];
  if (hits.length === 0) return null;
  const preferred = slugKey(CROSS_PROVIDER_IDS[slugKey(slug)]?.gecko || canonicalGeckoForTicker(slug) || slug);
  const exact = hits.filter((coin) => slugKey(coin.id) === preferred);
  return exact.length === 1 ? exact[0] : null;
}

/**
 * Quote id sent to CoinGecko.
 * A pinned ticker always uses its canonical id. A contract address is left as written.
 */
export function quoteCoinId(symbol: string, explicitId: string, remembered: string): string {
  const explicit = explicitId.trim();
  const lower = explicit.toLowerCase();
  if (lower.includes("0x") || explicit.length > 80) return explicit;
  const canonical = canonicalGeckoForTicker(symbol);
  if (canonical) return canonical;
  return explicit || remembered.trim();
}

/**
 * One snapshot row for a trade or tape symbol.
 * A collision-prone ticker matches its canonical id only.
 * Any other ticker matches a symbol only when exactly one row has it.
 * An ambiguous symbol returns no row.
 */
export function pickListedCoin<T extends ListedIdentity>(
  coins: T[],
  input: { symbol?: string | null; coinId?: string | null }
): T | null {
  const symbol = (input.symbol || "").trim().toUpperCase();
  const coinId = slugKey(input.coinId);
  if (symbol) {
    const matches = coins.filter((row) => (row.symbol || "").toUpperCase() === symbol);
    const pinned = collisionIdsForTicker(symbol);
    if (pinned) {
      const exact = matches.filter((row) => pinned.has(slugKey(row.id)));
      if (exact.length === 1) return exact[0];
      if (exact.length > 1) {
        const gecko = slugKey(canonicalGeckoForTicker(symbol));
        const preferred = exact.filter((row) => slugKey(row.id) === gecko);
        return preferred.length === 1 ? preferred[0] : null;
      }
      // The canonical asset is not in this list. Do not borrow another id.
      return null;
    } else if (matches.length === 1) {
      return matches[0];
    } else if (matches.length > 1) {
      return null;
    }
  }
  if (!coinId) return null;
  const ids = listedIdsForSlug(coinId);
  const byId = coins.filter((row) => ids.has(slugKey(row.id)));
  if (byId.length === 1) return byId[0];
  if (byId.length > 1) {
    const preferred = byId.filter((row) => slugKey(row.id) === coinId);
    return preferred.length === 1 ? preferred[0] : null;
  }
  return null;
}
