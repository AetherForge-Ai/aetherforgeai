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
 * crypto — CoinGecko, CoinPaprika, CoinCap, Binance public tickers, then Kraken,
 *   Coinbase, and Yahoo Finance for mapped symbols.
 *   Swyftx is named only when SWYFTX_PUBLIC_DISPLAY is on.
 * DEX — GeckoTerminal and DexPaprika. DexScreener is named only when DEXSCREENER_PUBLIC_DISPLAY is on
 *   (https://docs.dexscreener.com/api/reference, GET /latest/dex/search, no key).
 * metals — api.gold-api.com (not a dealer feed)
 * FX — open.er-api.com daily; Frankfurter for a past trade date
 *
 * TODO(owner): confirm the AI provider name. Public copy says "AI" until then.
 *
 * The exported strings are shown to visitors. They must not contain the word TODO.
 */

import { sourceLabel } from "@/lib/crypto-price-chain";
import { dexscreenerPublicDisplay } from "@/lib/dexscreener-display";
import { publicSourceAllowed, swyftxPublicDisplay } from "@/lib/swyftx-display";

export const PUBLIC_EQUITY_SOURCE = "Yahoo Finance";
export const PUBLIC_CRYPTO_SOURCE = "CoinGecko";
export const PUBLIC_DEX_SOURCE = "GeckoTerminal";
export const PUBLIC_DEX_SECOND_SOURCE = "DexScreener";
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

/**
 * b30 H-15: every price provider the crypto code can call, in fallback order, with the
 * API hosts it calls. /trust and the "Source:" labels are built from this list; a unit
 * test fails when a crypto-*.ts file calls a host that is not listed here.
 * `flag` providers are named only while their public-display flag is on.
 */
export const CRYPTO_PRICE_PROVIDERS: ReadonlyArray<{ name: string; hosts: string[]; kind: "crypto" | "dex"; flag?: "swyftx" | "dexscreener" }> = [
  { name: PUBLIC_CRYPTO_SOURCE, hosts: ["api.coingecko.com", "pro-api.coingecko.com"], kind: "crypto" },
  { name: "CoinPaprika", hosts: ["api.coinpaprika.com"], kind: "crypto" },
  { name: "CoinCap", hosts: ["rest.coincap.io", "api.coincap.io"], kind: "crypto" },
  { name: "Binance", hosts: ["data-api.binance.vision", "api.binance.com"], kind: "crypto" },
  { name: "Swyftx", hosts: ["api.swyftx.com.au"], kind: "crypto", flag: "swyftx" },
  { name: "Kraken", hosts: ["api.kraken.com"], kind: "crypto" },
  { name: "Coinbase", hosts: ["api.exchange.coinbase.com"], kind: "crypto" },
  { name: PUBLIC_EQUITY_SOURCE, hosts: ["query1.finance.yahoo.com", "query2.finance.yahoo.com"], kind: "crypto" },
  { name: PUBLIC_DEX_SOURCE, hosts: ["api.geckoterminal.com"], kind: "dex" },
  { name: "DexPaprika", hosts: ["api.dexpaprika.com"], kind: "dex" },
  { name: PUBLIC_DEX_SECOND_SOURCE, hosts: ["api.dexscreener.com"], kind: "dex", flag: "dexscreener" },
];

function providerShown(flag: "swyftx" | "dexscreener" | undefined): boolean {
  if (flag === "swyftx") return swyftxPublicDisplay();
  if (flag === "dexscreener") return dexscreenerPublicDisplay();
  return true;
}

function cryptoSourceNames(): string[] {
  return CRYPTO_PRICE_PROVIDERS.filter((p) => p.kind === "crypto" && providerShown(p.flag)).map((p) => p.name);
}

function dexSourceNames(): string[] {
  return CRYPTO_PRICE_PROVIDERS.filter((p) => p.kind === "dex" && providerShown(p.flag)).map((p) => p.name);
}

/** Request-time sources line. A flipped display flag is visible on the next read. */
export function publicDataSourcesLine(): string {
  return (
    "Prices for NZX- and ASX-listed shares, and for US shares, come from public market data (Yahoo Finance). " +
    "They are not a direct NZX or ASX feed. " +
    // b35 H-15 (GOAL-LOCK #14): MARKET_DATA_API_KEY is set in production, so Twelve Data is named.
    "When configured, Twelve Data is also used as a share-quote source. " +
    "When a newer print is not in the response, the page shows the last saved print and its time. " +
    `Crypto prices come from ${englishList(cryptoSourceNames())}. ` +
    `DEX token prices come from ${englishList(dexSourceNames())}. ` +
    `Gold and silver spot prices come from ${PUBLIC_METALS_SOURCE}. ` +
    `Foreign-exchange rates are a daily rate from ${PUBLIC_FX_SOURCE}. Past trade-date rates use Frankfurter. ` +
    "Prices may be delayed and are for information only. " +
    "Calculations by AetherForge; plain-English notes written by AI."
  );
}

/** Per-row source. A missing or hidden source is named as unavailable. */
export function publicCoinSourceLine(source?: string | null): string {
  const parts = String(source || "")
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter((id) => id && publicSourceAllowed(id));
  if (!parts.length) return "Source unavailable.";
  const names = parts.map((id) => sourceLabel(id)).filter(Boolean);
  if (!names.length) return "Source unavailable.";
  return `Price source: ${names.join(", ")}. Quotes can be delayed.`;
}

export const PUBLIC_COIN_ABOUT =
  "Indicative USD quote. Figures can be delayed. The as-of time is shown with the price.";

export const PUBLIC_PRICE_QUIET = "Prices are not shown right now.";

/** Drop internal feed notes. Keep a real description when the vendor text is clean. */
export function publicCoinDescription(description: string | null | undefined): string {
  const text = (description || "").trim();
  if (!text || /fallback|unavailable/i.test(text)) return PUBLIC_COIN_ABOUT;
  if (/swyftx/i.test(text) && !swyftxPublicDisplay()) return PUBLIC_COIN_ABOUT;
  if (/dexscreener/i.test(text) && !dexscreenerPublicDisplay()) return PUBLIC_COIN_ABOUT;
  return text;
}
