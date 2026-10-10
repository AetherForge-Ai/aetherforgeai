/**
 * A DEX fill keeps its source. Coin-list crypto stays "Crypto".
 * Chain is the readable network name (Ethereum, Solana), not a pool address.
 */

export interface DexSource {
  venue?: string | null;
  market?: string | null;
  chain?: string | null;
}

export function isDexSource(input: DexSource | null | undefined): boolean {
  if (!input) return false;
  return input.venue === "DEX" || input.market === "DEX";
}

/** "DEX · Ethereum", or "DEX" when the chain was not recorded. */
export function dexSourceLabel(input: DexSource | null | undefined): string | null {
  if (!isDexSource(input)) return null;
  const chain = (input?.chain || "").trim();
  return chain ? `DEX · ${chain}` : "DEX";
}

export function cleanChain(value: unknown): string | null {
  const chain = String(value || "").trim();
  if (!chain || chain === "Unavailable") return null;
  return chain.slice(0, 80);
}
