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
    // 404 is an outage here, not proof the id is missing. Only a 200 array decides that.
    if (res.status !== 200) return "down";
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

type ProbeBody = { status: number; body: unknown } | "down";

async function readProbe(url: string): Promise<ProbeBody> {
  try {
    const res = await fetch(url, {
      headers: { accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(PROBE_MS),
    });
    if (res.status !== 200 && res.status !== 404) return "down";
    const text = await res.text();
    try {
      return { status: res.status, body: JSON.parse(text) };
    } catch {
      return res.status === 404 ? { status: 404, body: null } : "down";
    }
  } catch {
    return "down";
  }
}

function paprikaTickerState(status: number, body: unknown): CoinUpstream {
  if (status === 404) return "empty";
  if (status !== 200) return "down";
  if (!body || typeof body !== "object" || Array.isArray(body)) return "empty";
  const id = String((body as { id?: unknown }).id || "").trim();
  return id ? "asset" : "empty";
}

function paprikaSearchState(status: number, body: unknown, slug: string): CoinUpstream {
  if (status === 404) return "empty";
  if (status !== 200) return "down";
  const currencies =
    body && typeof body === "object" && Array.isArray((body as { currencies?: unknown }).currencies)
      ? ((body as { currencies: Array<{ id?: string }> }).currencies)
      : [];
  const want = slug.trim().toLowerCase();
  const match = currencies.some((row) => {
    const id = String(row?.id || "").trim().toLowerCase();
    return id === want || id.endsWith(`-${want}`);
  });
  return match ? "asset" : "empty";
}

/**
 * Second opinion after CoinGecko returned a completed empty list.
 * /v1/tickers/<slug> first, then the search used by searchPaprikaId.
 * A 200 coin is an asset. 404 or a search with no id is empty. Anything else is down.
 */
async function probePaprikaCoin(slug: string): Promise<CoinUpstream> {
  const ticker = await readProbe(`https://api.coinpaprika.com/v1/tickers/${encodeURIComponent(slug)}?quotes=USD`);
  if (ticker === "down") return "down";
  const direct = paprikaTickerState(ticker.status, ticker.body);
  if (direct !== "empty") return direct;
  const search = await readProbe(
    `https://api.coinpaprika.com/v1/search/?q=${encodeURIComponent(slug)}&c=currencies&limit=8`
  );
  if (search === "down") return "down";
  return paprikaSearchState(search.status, search.body, slug);
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
  if (known) {
    return decideCoinPage({ slug: raw, knownCanonical: known, upstream: "down" });
  }
  const gecko = await probeGeckoCoin(raw);
  // A CoinGecko failure is not "no such coin". Do not ask Paprika to turn an outage into a 404.
  if (gecko !== "empty") {
    return decideCoinPage({
      slug: raw,
      knownCanonical: null,
      upstream: gecko,
      upstreamCanonical: gecko === "asset" ? raw : null,
    });
  }
  const paprika = await probePaprikaCoin(raw);
  return decideCoinPage({
    slug: raw,
    knownCanonical: null,
    upstream: paprika,
    upstreamCanonical: paprika === "asset" ? raw : null,
  });
});
