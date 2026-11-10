/**
 * Decides whether /markets/crypto/[id] renders, redirects, or 404s.
 * The price read is a separate step. A missing price is not a missing coin.
 */

import "server-only";

import { cache } from "react";
import { coinGeckoEndpoint } from "@/lib/coingecko-auth";
import { savedCoinSlug } from "@/lib/crypto-depth.server";
import { isNativeCoinSlug } from "@/lib/crypto-board";
import { resolvableCoinId } from "@/lib/crypto-market";
import {
  catalogueCanonical,
  classifyGeckoMarkets,
  decideCoinPage,
  type CoinPageDecision,
  type CoinUpstream,
} from "@/lib/crypto-slug";

const PROBE_MS = 1_200;

async function probeOnce(slug: string, path: string, keyless: boolean): Promise<CoinUpstream> {
  const endpoint = coinGeckoEndpoint(process.env, keyless);
  try {
    const res = await fetch(`${endpoint.base}${path}`, {
      headers: endpoint.headers,
      cache: "no-store",
      signal: AbortSignal.timeout(PROBE_MS),
    });
    if (res.status === 404) return "empty";
    if (!res.ok) return "down";
    const type = res.headers.get("content-type") || "";
    const text = await res.text();
    const trimmed = text.trim();
    if (!type.includes("json") && !trimmed.startsWith("[") && !trimmed.startsWith("{")) return "down";
    try {
      return classifyGeckoMarkets(res.status, JSON.parse(text), slug);
    } catch {
      return "down";
    }
  } catch {
    return "down";
  }
}

/** Completed CoinGecko lookup. Empty means the id is not a coin. A failure is "down". */
export async function probeGeckoCoin(slug: string): Promise<CoinUpstream> {
  const path =
    `/coins/markets?vs_currency=usd&ids=${encodeURIComponent(slug)}` +
    "&order=market_cap_desc&per_page=1&page=1&sparkline=false";
  const first = await probeOnce(slug, path, false);
  if (first !== "down") return first;
  if (coinGeckoEndpoint().mode === "keyless") return "down";
  return probeOnce(slug, path, true);
}

function localCanonical(slug: string): string | null {
  return catalogueCanonical(slug) || (isNativeCoinSlug(slug) ? slug : null);
}

/** One answer per request, shared by generateMetadata and the page. */
export const resolvePublicCoin = cache(async (id: string): Promise<CoinPageDecision> => {
  const raw = resolvableCoinId(id);
  if (!raw) return { action: "render", canonical: "" };

  let known = localCanonical(raw);
  if (!known) {
    try {
      const saved = await savedCoinSlug(raw);
      if (saved) known = localCanonical(saved) || saved;
    } catch {
      known = null;
    }
  }

  // A catalogue or saved-list hit is enough. Do not ask the price API whether the coin exists.
  const upstream = known ? "down" : await probeGeckoCoin(raw);
  return decideCoinPage({
    slug: raw,
    knownCanonical: known,
    upstream,
    upstreamCanonical: upstream === "asset" ? raw : null,
  });
});
