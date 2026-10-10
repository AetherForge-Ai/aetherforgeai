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
 * crypto — CoinGecko, then Kraken, Coinbase, and Yahoo Finance for mapped symbols.
 *   Swyftx is named only when SWYFTX_PUBLIC_DISPLAY is on.
 * DEX — GeckoTerminal
 * metals — api.gold-api.com (not a dealer feed)
 * FX — open.er-api.com daily; Frankfurter for a past trade date
 *
 * TODO(owner): confirm the AI provider name. Public copy says "AI" until then.
 *
 * The exported strings are shown to visitors. They must not contain the word TODO.
 */

import { sourceLabel } from "@/lib/crypto-price-chain";
import { publicSourceAllowed, swyftxPublicDisplay } from "@/lib/swyftx-display";

export const PUBLIC_EQUITY_SOURCE = "Yahoo Finance";
export const PUBLIC_CRYPTO_SOURCE = "CoinGecko";
export const PUBLIC_DEX_SOURCE = "GeckoTerminal";
export const PUBLIC_METALS_SOURCE = "gold-api.com";
export const PUBLIC_FX_SOURCE = "ExchangeRate-API";

function englishList(items: string[]): string {
  if (items.length <= 1) return items[0] || "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

export function publicCryptoSourcesLabel(): string {
  return englishList(cryptoSourceNames());
}

function cryptoSourceNames(): string[] {
  const names = [PUBLIC_CRYPTO_SOURCE];
  if (swyftxPublicDisplay()) names.push("Swyftx");
  names.push("Kraken", "Coinbase", PUBLIC_EQUITY_SOURCE);
  return names;
}

/** Request-time sources line. A flipped display flag is visible on the next read. */
export function publicDataSourcesLine(): string {
  return (
    "Prices for NZX- and ASX-listed shares, and for US shares, come from public market data (Yahoo Finance). " +
    "They are not a direct NZX or ASX feed. " +
    "When a newer print is not in the response, the page shows the last saved print and its time. " +
    `Crypto prices come from ${englishList(cryptoSourceNames())}. ` +
    `DEX token prices come from ${PUBLIC_DEX_SOURCE}. ` +
    `Gold and silver spot prices come from ${PUBLIC_METALS_SOURCE}. ` +
    `Foreign-exchange rates are a daily rate from ${PUBLIC_FX_SOURCE}. Past trade-date rates use Frankfurter. ` +
    "Prices may be delayed and are for information only. " +
    "Calculations by AetherForge; plain-English notes written by AI."
  );
}

/** Per-row source. A missing or hidden source does not claim a single vendor. */
export function publicCoinSourceLine(source?: string | null): string {
  const id = (source || "").trim().toLowerCase();
  if (!id || !publicSourceAllowed(id)) {
    return "Price source: public market data. Quotes can be delayed.";
  }
  return `Price source: ${sourceLabel(id)}. Quotes can be delayed.`;
}

export const PUBLIC_COIN_ABOUT =
  "Indicative USD quote. Figures can be delayed. The as-of time is shown with the price.";

export const PUBLIC_PRICE_QUIET = "Prices are not shown right now.";

/** Drop internal feed notes. Keep a real description when the vendor text is clean. */
export function publicCoinDescription(description: string | null | undefined): string {
  const text = (description || "").trim();
  if (!text || /fallback|unavailable/i.test(text)) return PUBLIC_COIN_ABOUT;
  if (/swyftx/i.test(text) && !swyftxPublicDisplay()) return PUBLIC_COIN_ABOUT;
  return text;
}
