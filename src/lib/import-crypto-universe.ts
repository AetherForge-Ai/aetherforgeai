/**
 * Tradable crypto for a broker file.
 * PEPE is always accepted. A row still needs its own price in the file.
 */

const listed = new Set<string>(["PEPE"]);

export function isTradableCrypto(raw: string): boolean {
  const ticker = raw.trim().toUpperCase();
  return ticker.length > 0 && listed.has(ticker);
}
