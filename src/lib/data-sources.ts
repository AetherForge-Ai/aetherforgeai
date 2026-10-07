/**
 * Public data-source wording. One place so the home strip, /api/ticker, /trust
 * and coin pages name the same sources.
 *
 * TODO(owner): confirm the share-price vendor name before naming Twelve Data or Yahoo in public copy.
 * TODO(owner): confirm the Yahoo licence position for prices in a paid product.
 * TODO(owner): confirm the metals spot vendor name.
 * TODO(owner): confirm the FX vendor name.
 * TODO(owner): confirm the AI provider name. Public copy says "intelligent AI bots" until then.
 * TODO(owner): confirm whether Swyftx should be named beside CoinGecko. The markets code calls CoinGecko.
 *
 * The exported strings are shown to visitors. They must not contain the word TODO.
 */

export const PUBLIC_EQUITY_SOURCE = "licensed market data";
export const PUBLIC_CRYPTO_SOURCE = "CoinGecko";
export const PUBLIC_DEX_SOURCE = "GeckoTerminal";
export const PUBLIC_METALS_SOURCE = "licensed market data";
export const PUBLIC_FX_SOURCE = "licensed market data";

export const PUBLIC_DATA_SOURCES_LINE =
  `Data sources: NZX/ASX/US shares: ${PUBLIC_EQUITY_SOURCE}, delayed or last close as labelled · ` +
  `Crypto: ${PUBLIC_CRYPTO_SOURCE} · DEX tokens: ${PUBLIC_DEX_SOURCE} · ` +
  `Metals: ${PUBLIC_METALS_SOURCE} · FX: ${PUBLIC_FX_SOURCE}, daily rate. ` +
  "Calculations by AetherForge; plain-English notes written by intelligent AI bots.";

export const PUBLIC_COIN_SOURCE_LINE = `Price source: ${PUBLIC_CRYPTO_SOURCE}. Quotes can be delayed.`;

export const PUBLIC_COIN_ABOUT = `Live USD quote from ${PUBLIC_CRYPTO_SOURCE}.`;

export const PUBLIC_PRICE_QUIET = "Prices are not shown right now.";

/** Drop internal feed notes. Keep a real description when the vendor text is clean. */
export function publicCoinDescription(description: string | null | undefined): string {
  const text = (description || "").trim();
  if (!text || /fallback|unavailable/i.test(text)) return PUBLIC_COIN_ABOUT;
  return text;
}
