/**
 * Title and description for /markets/crypto/[id].
 * A price, time, source, or market cap is included only when the caller has one.
 *
 * pull-check:retest4-2026-10-11
 */

import { formatDisplayDateTime, formatUnitPrice } from "@/lib/currency";
import { fmtCompactUsd } from "@/lib/crypto-market";
import { sourceLabel } from "@/lib/crypto-price-chain";
import { CRYPTO_VENDORS, type CryptoVendor } from "@/lib/crypto-vendors";

const bySlug = new Map<string, CryptoVendor>();
for (const row of Object.values(CRYPTO_VENDORS)) {
  if (!bySlug.has(row.coingecko)) bySlug.set(row.coingecko, row);
}

/** Configured name for a CoinGecko slug. Unknown slugs are not guessed. */
export function vendorByCoingeckoId(id: string): CryptoVendor | null {
  return bySlug.get((id || "").trim().toLowerCase()) ?? null;
}

export interface CryptoDetailFacts {
  slug: string;
  name?: string | null;
  symbol?: string | null;
  priceUsd?: number | null;
  /** NZD amount only when the FX snapshot was sourced. */
  priceNzd?: number | null;
  nzdSourced?: boolean;
  asOf?: string | null;
  source?: string | null;
  marketCapUsd?: number | null;
}

function coinLabel(facts: CryptoDetailFacts): string {
  const symbol = (facts.symbol || "").trim().toUpperCase();
  const name = (facts.name || "").trim();
  if (name && symbol && name.toUpperCase() !== symbol) return `${name} (${symbol})`;
  if (name) return name;
  if (symbol) return symbol;
  return (facts.slug || "").trim() || "This coin";
}

/** "Bitcoin (BTC) price in NZD" when a sourced NZD amount exists. Otherwise the currency we actually have. */
export function cryptoDetailCopy(facts: CryptoDetailFacts): { title: string; description: string } {
  const label = coinLabel(facts);
  const usd = typeof facts.priceUsd === "number" && Number.isFinite(facts.priceUsd) && facts.priceUsd > 0 ? facts.priceUsd : null;
  const nzd =
    facts.nzdSourced === true && typeof facts.priceNzd === "number" && Number.isFinite(facts.priceNzd) && facts.priceNzd > 0
      ? facts.priceNzd
      : null;
  const title = nzd != null ? `${label} price in NZD` : usd != null ? `${label} price in USD` : `${label} price`;

  const parts = [label];
  if (usd != null) {
    const wall = facts.asOf ? formatDisplayDateTime(facts.asOf) : "—";
    const asOf = !facts.asOf || wall === "—" ? "as of not stated by the vendor" : `as of ${wall}`;
    const source = (facts.source || "").trim();
    const priced = `${formatUnitPrice(usd, "USD")} ${asOf}`;
    parts.push(source ? `${priced} · ${sourceLabel(source)}` : priced);
  } else {
    parts.push("No earlier price is stored for this coin.");
  }
  if (nzd != null) parts.push(`${formatUnitPrice(nzd, "NZD")} in NZD.`);
  const cap = fmtCompactUsd(facts.marketCapUsd);
  if (cap !== "—") parts.push(`Market cap ${cap}.`);
  return { title, description: parts.join(" ") };
}

/** WebPage JSON-LD. The caller supplies the title and description already shown on the page. */
export function cryptoDetailJsonLd(input: { title: string; description: string; url: string }): string {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: input.title,
    description: input.description,
    url: input.url,
  });
}
