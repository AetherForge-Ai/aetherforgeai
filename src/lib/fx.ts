/**
 * Live FX rates — SERVER-ONLY.
 *
 * Fetches current exchange rates and normalises them to "1 unit → NZD" so the
 * Stox portfolio total (NZD) can convert AUD (.AX) and USD holdings correctly.
 * Uses the keyless open.er-api.com endpoint. On any failure it falls back to
 * the BASELINE_FX_TO_NZD table so the app never breaks — it just uses slightly
 * stale rates. Results are cached in-memory for the process lifetime (TTL).
 */

import { BASELINE_FX_TO_NZD, type FxRatesToNZD } from "./currency";

export interface FxSnapshot {
  ratesToNZD: FxRatesToNZD;
  live: boolean; // true if pulled from the live endpoint, false if baseline
  asOf: string; // ISO timestamp of when we resolved these
}

// One-hour in-memory cache. FX moves slowly enough that hourly is plenty and
// keeps us well within any free-tier limits.
const TTL_MS = 60 * 60 * 1000;
let cache: { snapshot: FxSnapshot; fetchedAtMs: number } | null = null;

/**
 * open.er-api.com returns rates with USD (or any base) as the base:
 *   { result: "success", base_code: "NZD", rates: { AUD: 0.92, USD: 0.60, ... } }
 * i.e. 1 NZD = rates[X] units of X. We want the inverse: 1 X = (1/rates[X]) NZD.
 */
async function fetchLiveRatesToNZD(): Promise<FxRatesToNZD> {
  const res = await fetch("https://open.er-api.com/v6/latest/NZD", {
    // Revalidate hourly at the platform layer too.
    next: { revalidate: 3600 },
  } as RequestInit);

  if (!res.ok) throw new Error(`FX endpoint HTTP ${res.status}`);

  const json = (await res.json()) as {
    result?: string;
    rates?: Record<string, number>;
  };

  if (json.result !== "success" || !json.rates) {
    throw new Error("FX endpoint returned no rates");
  }

  const audPerNzd = json.rates.AUD;
  const usdPerNzd = json.rates.USD;

  if (!audPerNzd || !usdPerNzd) throw new Error("FX endpoint missing AUD/USD");

  return {
    NZD: 1,
    AUD: 1 / audPerNzd, // 1 AUD → NZD
    USD: 1 / usdPerNzd, // 1 USD → NZD
  };
}

/**
 * Resolve FX rates (live if possible, cached, baseline on failure).
 * Never throws — always returns a usable snapshot.
 */
export async function getFxSnapshot(nowMs?: number): Promise<FxSnapshot> {
  const t = nowMs ?? Date.now();

  if (cache && t - cache.fetchedAtMs < TTL_MS) {
    return cache.snapshot;
  }

  try {
    const ratesToNZD = await fetchLiveRatesToNZD();
    const snapshot: FxSnapshot = {
      ratesToNZD,
      live: true,
      asOf: new Date(t).toISOString(),
    };
    cache = { snapshot, fetchedAtMs: t };
    console.log("[fx] Live FX rates resolved:", ratesToNZD);
    return snapshot;
  } catch (err) {
    console.error("[fx] Live FX fetch failed, using baseline rates:", err);
    const snapshot: FxSnapshot = {
      ratesToNZD: { ...BASELINE_FX_TO_NZD },
      live: false,
      asOf: new Date(t).toISOString(),
    };
    // Cache the baseline briefly too so we don't hammer a failing endpoint.
    cache = { snapshot, fetchedAtMs: t };
    return snapshot;
  }
}
