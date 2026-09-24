/**
 * Broker fee presets (NZ English) — advisory estimates for paper fills.
 * Caps inspired by common NZ retail brokers (e.g. Sharesies-style NZ/AU/US).
 * Never claimed as a live broker quote; user can override.
 */

export type FeeMarket = "NZ" | "AU" | "US" | "CRYPTO" | "METAL";

export interface FeePreset {
  id: string;
  label: string;
  /** Fixed NZD (or native desk currency) component. */
  fixed: number;
  /** Percent of notional (0.5 = 0.5%). */
  percent: number;
  /** Cap on the percent/fixed blend when set. */
  cap?: number;
  market: FeeMarket;
}

export const FEE_PRESETS: FeePreset[] = [
  { id: "nz-retail", label: "NZ shares · retail", fixed: 0, percent: 0.5, cap: 25, market: "NZ" },
  { id: "au-retail", label: "ASX · retail", fixed: 0, percent: 0.5, cap: 25, market: "AU" },
  { id: "us-retail", label: "US shares · retail", fixed: 3, percent: 0, cap: 3, market: "US" },
  { id: "crypto-pct", label: "Crypto · ~1%", fixed: 0, percent: 1, market: "CRYPTO" },
  { id: "metal-spread", label: "Metals · ~1%", fixed: 0, percent: 1, market: "METAL" },
  { id: "zero", label: "No fee", fixed: 0, percent: 0, market: "NZ" },
];

/** Infer fee market from ticker / asset class. */
export function feeMarketFor(ticker: string, assetType?: string | null): FeeMarket {
  const t = (ticker || "").toUpperCase();
  const at = (assetType || "stock").toLowerCase();
  if (at === "crypto") return "CRYPTO";
  if (at === "metal" || t === "GOLD" || t === "SILVER") return "METAL";
  if (t.endsWith(".NZ")) return "NZ";
  if (t.endsWith(".AX")) return "AU";
  return "US";
}

/** Estimate brokerage for a notional trade. */
export function estimateFee(notional: number, preset: FeePreset): number {
  if (!(notional > 0)) return 0;
  const pctPart = (notional * preset.percent) / 100;
  let total = preset.fixed + pctPart;
  if (typeof preset.cap === "number" && preset.cap >= 0) {
    total = Math.min(total, preset.cap + (preset.percent > 0 && preset.fixed === 0 ? 0 : 0));
    // When fixed+percent both apply with a cap, cap the whole fee.
    if (preset.fixed > 0 && preset.percent > 0) total = Math.min(preset.fixed + pctPart, preset.cap);
    else if (preset.percent > 0) total = Math.min(pctPart, preset.cap);
    else total = Math.min(preset.fixed, preset.cap);
  }
  return Math.round(total * 100) / 100;
}

export function presetsForMarket(market: FeeMarket): FeePreset[] {
  const matched = FEE_PRESETS.filter((p) => p.market === market || p.id === "zero");
  return matched.length ? matched : FEE_PRESETS.filter((p) => p.id === "zero");
}

/** Market default used by Buy and Sell so a selected preset is actually booked. */
export function defaultFeePresetId(ticker: string, assetType?: string | null): string {
  const market = feeMarketFor(ticker, assetType);
  return presetsForMarket(market).find((p) => p.id !== "zero")?.id ?? "zero";
}
