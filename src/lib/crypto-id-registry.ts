/**
 * CoinGecko ids seen on the markets and DEX lists.
 * A later quote can ask for that id instead of guessing from the ticker.
 */

const ids = new Map<string, string>();

export function rememberCryptoIds(rows: Array<{ symbol?: string; id?: string }>): void {
  for (const row of rows) {
    const symbol = String(row.symbol || "").trim().toUpperCase();
    const id = String(row.id || "").trim();
    if (!symbol || !id) continue;
    ids.set(symbol, id);
  }
}

export function lookupCryptoId(symbol: string): string | undefined {
  const id = ids.get(symbol.trim().toUpperCase());
  return id || undefined;
}

export function resetCryptoIdRegistry(): void {
  ids.clear();
}
