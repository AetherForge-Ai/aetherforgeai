/**
 * Tradable crypto for a broker file.
 * PEPE is always accepted. A loaded 400-coin snapshot adds the rest.
 */

const listed = new Set<string>(["PEPE"]);

export function noteTradableCrypto(symbols: Iterable<string>): void {
  for (const raw of symbols) {
    const ticker = String(raw || "").trim().toUpperCase();
    if (ticker) listed.add(ticker);
  }
}

export function isTradableCrypto(raw: string): boolean {
  const ticker = raw.trim().toUpperCase();
  return ticker.length > 0 && listed.has(ticker);
}
