/**
 * P2-POLISH-PULL-CHECK
 *
 * Public data-source wording. One place so the home strip, /api/ticker, /trust,
 * Terms, Privacy and coin pages name the same sources.
 *
 * The names match the calls in the code:
 * shares — Yahoo Finance (query1.finance.yahoo.com). A Twelve Data call exists in
 * fetchLiveQuotes only when MARKET_DATA_API_KEY is set. wrangler.jsonc sets no
 * vars, so that key is not part of the production config in this repo. Public
 * copy does not name Twelve Data.
 * crypto — CoinGecko, then Swyftx when that feed answers; Yahoo Finance is also called
 * DEX — GeckoTerminal
 * metals — api.gold-api.com (not a dealer feed)
 * FX — open.er-api.com daily; Frankfurter for a past trade date
 *
 * TODO(owner): confirm the AI provider name. Public copy says "AI" until then.
 *
 * The exported strings are shown to visitors. They must not contain the word TODO.
 */

export const PUBLIC_EQUITY_SOURCE = "Yahoo Finance";
export const PUBLIC_CRYPTO_SOURCE = "CoinGecko";
export const PUBLIC_DEX_SOURCE = "GeckoTerminal";
export const PUBLIC_METALS_SOURCE = "gold-api.com";
export const PUBLIC_FX_SOURCE = "ExchangeRate-API";

export const PUBLIC_DATA_SOURCES_LINE =
  "Prices for NZX- and ASX-listed shares, and for US shares, come from public market data (Yahoo Finance). " +
  "They are not a direct NZX or ASX feed. " +
  `Crypto prices come from ${PUBLIC_CRYPTO_SOURCE}, and from Swyftx when that feed answers. ` +
  `DEX token prices come from ${PUBLIC_DEX_SOURCE}. ` +
  `Gold and silver spot prices come from ${PUBLIC_METALS_SOURCE}. ` +
  `Foreign-exchange rates are a daily rate from ${PUBLIC_FX_SOURCE}. Past trade-date rates use Frankfurter. ` +
  "Prices may be delayed and are for information only. " +
  "Calculations by AetherForge; plain-English notes written by AI.";

export const PUBLIC_COIN_SOURCE_LINE = `Price source: ${PUBLIC_CRYPTO_SOURCE}. Quotes can be delayed.`;

export const PUBLIC_COIN_ABOUT = `Live USD quote from ${PUBLIC_CRYPTO_SOURCE}.`;

export const PUBLIC_PRICE_QUIET = "Prices are not shown right now.";

/** Drop internal feed notes. Keep a real description when the vendor text is clean. */
export function publicCoinDescription(description: string | null | undefined): string {
  const text = (description || "").trim();
  if (!text || /fallback|unavailable/i.test(text)) return PUBLIC_COIN_ABOUT;
  return text;
}
