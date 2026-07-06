/**
 * Live precious-metal spot prices — SERVER-ONLY.
 *
 * Gold (XAU) and silver (XAG) spot prices are quoted globally in USD per troy
 * ounce — the same figure Google surfaces for "gold price" / "silver price".
 * We pull the current-day spot from the keyless api.gold-api.com endpoint and
 * ALSO convert it into NZD (via the FX snapshot), because AetherForge presents
 * the precious-metals portfolio in NZD alongside the Stox NZD total worth.
 *
 * NEVER import this on the client. On any failure it falls back to a sensible
 * baseline so the feature never breaks — it just uses slightly stale prices.
 */

import { getFxSnapshot } from "./fx";
import { convertCurrency } from "./currency";

export type MetalKey = "gold" | "silver";

export interface MetalSpot {
  /** Current spot price, USD per troy ounce (global benchmark). */
  usdPerOz: number;
  /** Same spot converted to NZD per troy ounce for the NZD portfolio. */
  nzdPerOz: number;
}

export interface MetalsSpot {
  gold: MetalSpot;
  silver: MetalSpot;
  /** true when the live endpoint answered, false when using the baseline. */
  live: boolean;
  /** true when the USD→NZD conversion used live FX (vs the baseline table). */
  fxLive: boolean;
  asOf: string; // ISO timestamp
}

/**
 * Baseline USD/oz spot, used only when the live endpoint is unreachable.
 * Roughly mid-2026 levels; the live feed overrides these on every fetch.
 */
const BASELINE_USD_PER_OZ: Record<MetalKey, number> = {
  gold: 4160,
  silver: 62,
};

const SYMBOL: Record<MetalKey, string> = { gold: "XAU", silver: "XAG" };

// Short in-memory cache — spot moves intraday but a couple of minutes of
// freshness is plenty and keeps us well within the free endpoint's limits.
const TTL_MS = 2 * 60 * 1000;
let cache: { snapshot: MetalsSpot; fetchedAtMs: number } | null = null;

/** Fetch one metal's USD/oz spot from the keyless gold-api.com endpoint. */
async function fetchMetalUsd(metal: MetalKey): Promise<number> {
  const res = await fetch(`https://api.gold-api.com/price/${SYMBOL[metal]}`, {
    headers: { Accept: "application/json" },
    next: { revalidate: 120 },
  } as RequestInit);
  if (!res.ok) throw new Error(`gold-api HTTP ${res.status} for ${metal}`);
  const json = (await res.json()) as { price?: number };
  const price = Number(json?.price);
  if (!isFinite(price) || price <= 0) throw new Error(`gold-api bad price for ${metal}`);
  return price;
}

/**
 * Resolve current gold + silver spot (live if possible, cached, baseline on
 * failure). Never throws — always returns a usable snapshot in USD and NZD.
 */
export async function getMetalsSpot(nowMs?: number): Promise<MetalsSpot> {
  const t = nowMs ?? Date.now();
  if (cache && t - cache.fetchedAtMs < TTL_MS) return cache.snapshot;

  // FX first (its own cache + fallback), so we can express spot in NZD too.
  const fx = await getFxSnapshot(t);

  let goldUsd = BASELINE_USD_PER_OZ.gold;
  let silverUsd = BASELINE_USD_PER_OZ.silver;
  let live = false;
  try {
    const [g, s] = await Promise.all([fetchMetalUsd("gold"), fetchMetalUsd("silver")]);
    goldUsd = g;
    silverUsd = s;
    live = true;
    console.log(`[metals] Live spot resolved — gold $${g.toFixed(2)}/oz, silver $${s.toFixed(2)}/oz`);
  } catch (err) {
    console.error("[metals] Live spot fetch failed, using baseline prices:", err);
  }

  const toNzd = (usd: number) => convertCurrency(usd, "USD", "NZD", fx.ratesToNZD);
  const snapshot: MetalsSpot = {
    gold: { usdPerOz: goldUsd, nzdPerOz: toNzd(goldUsd) },
    silver: { usdPerOz: silverUsd, nzdPerOz: toNzd(silverUsd) },
    live,
    fxLive: fx.live,
    asOf: new Date(t).toISOString(),
  };

  cache = { snapshot, fetchedAtMs: t };
  return snapshot;
}
