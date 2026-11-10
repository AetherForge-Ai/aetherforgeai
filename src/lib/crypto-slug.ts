/**
 * One public URL per coin, and the rule that separates an unknown slug from a price outage.
 *
 * A slug is a known coin when the local catalogue names it (vendor list, this provider map,
 * or a native-chain id the caller passes in) or the saved market list has a row for it.
 * That does not depend on a live price. CoinGecko returning an empty markets list, or HTTP 404,
 * is a completed lookup that found no asset. A slug our own lists do not know is a 404
 * when CoinPaprika is empty or unreachable, even if CoinGecko is rate-limited. A slug those
 * lists do know still renders through a CoinGecko outage.
 */

import { resolvableCoinId } from "@/lib/crypto-market";
import { CROSS_PROVIDER_IDS } from "@/lib/crypto-provider-ids";
import { CRYPTO_VENDORS } from "@/lib/crypto-vendors";

const VENDOR_SLUGS = new Set(Object.values(CRYPTO_VENDORS).map((row) => row.coingecko));

export type CoinUpstream = "asset" | "empty" | "down";

export type CoinPageDecision =
  | { action: "not-found" }
  | { action: "redirect"; to: string }
  | { action: "render"; canonical: string };

/** CoinGecko id for a slug this map or the vendor list already names. Null when neither does. */
export function catalogueCanonical(slug: string): string | null {
  const raw = resolvableCoinId(slug);
  if (!raw) return null;
  const direct = CROSS_PROVIDER_IDS[raw];
  if (direct) return direct.gecko || raw;
  for (const [key, ids] of Object.entries(CROSS_PROVIDER_IDS)) {
    if (ids.paprika.toLowerCase() === raw) return ids.gecko || key;
    if (ids.gecko === raw) return ids.gecko;
  }
  if (VENDOR_SLUGS.has(raw)) return raw;
  return null;
}

/** Another slug for the same coin. Null when `slug` is already the CoinGecko id, or is unknown. */
export function coinAliasTarget(slug: string): string | null {
  const raw = resolvableCoinId(slug);
  if (!raw) return null;
  const canonical = catalogueCanonical(raw);
  if (canonical && canonical !== raw) return canonical;
  return null;
}

/** Slug used in links and the canonical URL. Unknown slugs stay as written so the page can 404 them. */
export function publicCoinSlug(id: string): string {
  const raw = resolvableCoinId(id);
  if (!raw) return (id || "").trim();
  return coinAliasTarget(raw) || raw;
}

export function coinPagePath(slug: string): string {
  return `/markets/crypto/${encodeURIComponent(slug)}`;
}

/** Every alias in the provider map, including Paprika ids that are not the CoinGecko id. */
export function coinPageRedirects(): Array<{ source: string; destination: string }> {
  const rows: Array<{ source: string; destination: string }> = [];
  const seen = new Set<string>();
  for (const [slug, ids] of Object.entries(CROSS_PROVIDER_IDS)) {
    const canonical = ids.gecko || slug;
    for (const alias of [slug, ids.paprika]) {
      const key = (alias || "").trim().toLowerCase();
      if (!key || key === canonical || seen.has(key) || !resolvableCoinId(key)) continue;
      seen.add(key);
      rows.push({ source: coinPagePath(key), destination: coinPagePath(canonical) });
    }
  }
  return rows;
}

/** 308 target for an alias coin URL. Null for the canonical slug and for everything else. */
export function coinSlugRedirect(pathname: string): string | null {
  const path = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  const match = /^\/markets\/crypto\/([^/]+)$/.exec(path);
  if (!match) return null;
  let slug = match[1];
  try {
    slug = decodeURIComponent(slug);
  } catch {
    return null;
  }
  const target = coinAliasTarget(slug);
  if (!target) return null;
  return coinPagePath(target);
}

/**
 * What a finished CoinGecko /coins/markets response means for this slug.
 * Only HTTP 200 with an array that does not contain this id is "no such coin".
 * HTTP 404 is an outage, same as a timeout or a 5xx. A row with this id counts
 * even when the price is missing.
 */
export function classifyGeckoMarkets(status: number, body: unknown, slug: string): CoinUpstream {
  if (status !== 200) return "down";
  if (!Array.isArray(body)) return "down";
  const want = slug.trim().toLowerCase();
  const hit = body.some((row) => {
    if (!row || typeof row !== "object") return false;
    return String((row as { id?: unknown }).id || "").trim().toLowerCase() === want;
  });
  return hit ? "asset" : "empty";
}

/**
 * Unknown slug → 404, including when the price APIs are down.
 * Known coin, including while CoinGecko is down → render (or redirect an alias).
 */
export function decideCoinPage(input: {
  slug: string;
  /** Catalogue or saved list. Independent of whether a price came back. */
  knownCanonical: string | null;
  upstream: CoinUpstream;
  upstreamCanonical?: string | null;
}): CoinPageDecision {
  const raw = resolvableCoinId(input.slug);
  if (!raw) return { action: "render", canonical: "" };

  const alias = coinAliasTarget(raw);
  if (alias) return { action: "redirect", to: coinPagePath(alias) };

  const known = input.knownCanonical ? publicCoinSlug(input.knownCanonical) || input.knownCanonical : null;
  if (known) {
    if (known !== raw) return { action: "redirect", to: coinPagePath(known) };
    return { action: "render", canonical: known };
  }

  if (input.upstream === "asset") {
    const fromFeed = input.upstreamCanonical ? publicCoinSlug(input.upstreamCanonical) : raw;
    const canonical = fromFeed || raw;
    if (canonical !== raw) return { action: "redirect", to: coinPagePath(canonical) };
    return { action: "render", canonical };
  }

  // No local record. An empty provider answer and an unreachable provider are both "not this coin".
  return { action: "not-found" };
}
