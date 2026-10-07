/**
 * Live FX rates — SERVER-ONLY.
 *
 * Fetches current exchange rates and normalises them to "1 unit → NZD" so the
 * Stox portfolio total (NZD) can convert AUD (.AX) and USD holdings correctly.
 * Uses the keyless open.er-api.com endpoint. On any failure it falls back to
 * the BASELINE_FX_TO_NZD table so the app never breaks — it just uses slightly
 * stale rates. Results are cached in-memory for the process lifetime (TTL).
 */

import { BASELINE_FX_TO_NZD, normalizeFxRates, type CurrencyCode, type FxRatesToNZD } from "./currency";

export interface FxSnapshot {
  ratesToNZD: FxRatesToNZD;
  /** Always false. A daily rate is not an intraday quote. */
  live: boolean;
  /** True when the rate was fetched, false when the baseline table is in use or the provider sent no rate time. */
  sourced: boolean;
  /** Provider rate time (open.er-api time_last_update_unix) as ISO. Null when that field is missing or the baseline table is in use. Never the fetch clock. */
  asOf: string | null;
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
/** open.er-api time_last_update_unix → ISO. Missing or invalid is null, never the fetch clock. */
export function providerRateAsOf(unix: unknown): string | null {
  const n = typeof unix === "number" ? unix : typeof unix === "string" && unix.trim() ? Number(unix) : NaN;
  if (!Number.isFinite(n) || n <= 0) return null;
  const ms = n > 1e12 ? n : n * 1000;
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function fetchLiveRatesToNZD(): Promise<{ rates: FxRatesToNZD; asOf: string | null }> {
  const res = await fetch("https://open.er-api.com/v6/latest/NZD", {
    // Revalidate hourly at the platform layer too.
    next: { revalidate: 3600 },
  } as RequestInit);

  if (!res.ok) throw new Error(`FX endpoint HTTP ${res.status}`);

  const json = (await res.json()) as {
    result?: string;
    rates?: Record<string, number>;
    time_last_update_unix?: number;
  };

  if (json.result !== "success" || !json.rates) {
    throw new Error("FX endpoint returned no rates");
  }

  const audPerNzd = json.rates.AUD;
  const usdPerNzd = json.rates.USD;

  if (!audPerNzd || !usdPerNzd) throw new Error("FX endpoint missing AUD/USD");

  // er-api base NZD: rates.USD is USD per 1 NZD (~0.57), NOT NZD per 1 USD.
  // Invert, then run the direction guard so a payload that is already NZD-per-USD
  // (or a missed invert) cannot be stored as a sub-1 multiplier.
  return {
    rates: normalizeFxRates({
      NZD: 1,
      AUD: 1 / audPerNzd,
      USD: 1 / usdPerNzd,
    }),
    asOf: providerRateAsOf(json.time_last_update_unix),
  };
}

/**
 * NZD per 1 unit of currency on a past trade date (Frankfurter).
 * Null when the day is missing or the feed has no print. Today's snapshot is separate.
 */
export async function historicalNzdPerUnit(
  currency: CurrencyCode,
  day: string | null | undefined
): Promise<number | null> {
  if (currency === "NZD") return 1;
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  try {
    const res = await fetch(`https://api.frankfurter.app/${day}?from=${currency}&to=NZD`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { rates?: { NZD?: number } };
    const rate = Number(json?.rates?.NZD);
    return rate > 0 && Number.isFinite(rate) ? rate : null;
  } catch (err) {
    console.error("[fx] Historical rate lookup failed:", err);
    return null;
  }
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
    const fetched = await fetchLiveRatesToNZD();
    const snapshot: FxSnapshot = {
      ratesToNZD: fetched.rates,
      live: false,
      sourced: fetched.asOf != null,
      asOf: fetched.asOf,
    };
    cache = { snapshot, fetchedAtMs: t };
    console.log("[fx] Live FX rates resolved:", fetched.rates);
    return snapshot;
  } catch (err) {
    console.error("[fx] Live FX fetch failed, using baseline rates:", err);
    const snapshot: FxSnapshot = {
      ratesToNZD: { ...BASELINE_FX_TO_NZD },
      live: false,
      sourced: false,
      asOf: null,
    };
    // Cache the baseline briefly too so we don't hammer a failing endpoint.
    cache = { snapshot, fetchedAtMs: t };
    return snapshot;
  }
}
