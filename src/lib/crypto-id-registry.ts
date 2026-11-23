/**
 * CoinGecko ids seen on the markets and DEX lists.
 * A later quote can ask for that id instead of guessing from the ticker.
 * A collision-prone ticker keeps its canonical id. A dust row cannot replace it.
 */

import { canonicalGeckoForTicker } from "@/lib/crypto-listed-match";

const ids = new Map<string, string>();

export function rememberCryptoIds(rows: Array<{ symbol?: string; id?: string }>): void {
  for (const row of rows) {
    const symbol = String(row.symbol || "").trim().toUpperCase();
    const id = String(row.id || "").trim();
    if (!symbol || !id) continue;
    const pinned = canonicalGeckoForTicker(symbol);
    if (pinned) {
      ids.set(symbol, pinned);
      continue;
    }
    ids.set(symbol, id);
  }
}

export function lookupCryptoId(symbol: string): string | undefined {
  const pinned = canonicalGeckoForTicker(symbol);
  if (pinned) return pinned;
  const id = ids.get(symbol.trim().toUpperCase());
  return id || undefined;
}

export function resetCryptoIdRegistry(): void {
  ids.clear();
}
