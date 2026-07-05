/**
 * Currency helpers — pure module, safe on client and server.
 *
 * AetherForge tracks holdings across three stock exchanges and crypto:
 *   • NZX  (.NZ suffix)  → NZD  (New Zealand dollars)
 *   • ASX  (.AX suffix)  → AUD  (Australian dollars)
 *   • US   (no suffix)   → USD  (US dollars)
 *   • Crypto             → USD  (all digital assets shown in US dollars)
 *
 * Each holding is DISPLAYED in its native currency (an ASX share shows AUD),
 * but the Stox "Total Worth" is aggregated in NZD — so AUD and USD holdings
 * are converted to NZD using live FX rates (with a baseline fallback). The
 * Koins (crypto) total stays in USD.
 */

export type CurrencyCode = "NZD" | "AUD" | "USD";
export type AssetType = "stock" | "crypto";

/** Rates expressed as: 1 unit of {currency} = N NZD. */
export type FxRatesToNZD = Record<CurrencyCode, number>;

/**
 * Baseline conversion rates (1 unit → NZD), used when the live FX endpoint is
 * unavailable. Roughly mid-2026 levels; the live feed overrides these.
 *   1 AUD ≈ 1.09 NZD, 1 USD ≈ 1.67 NZD.
 */
export const BASELINE_FX_TO_NZD: FxRatesToNZD = {
  NZD: 1,
  AUD: 1.09,
  USD: 1.67,
};

/** Human labels + symbols for each currency. */
export const CURRENCY_META: Record<CurrencyCode, { symbol: string; label: string; locale: string }> = {
  NZD: { symbol: "NZ$", label: "New Zealand Dollar", locale: "en-NZ" },
  AUD: { symbol: "AU$", label: "Australian Dollar", locale: "en-AU" },
  USD: { symbol: "US$", label: "US Dollar", locale: "en-US" },
};

/**
 * Resolve the native currency for a holding from its ticker + asset type.
 * Crypto is always USD. Stocks derive from the exchange suffix.
 */
export function currencyForTicker(ticker: string, assetType: AssetType = "stock"): CurrencyCode {
  if (assetType === "crypto") return "USD";
  const t = (ticker || "").trim().toUpperCase();
  if (t.endsWith(".NZ") || t.endsWith(".NZX")) return "NZD";
  if (t.endsWith(".AX") || t.endsWith(".ASX")) return "AUD";
  return "USD"; // US listings carry no suffix
}

/** The currency a whole portfolio is totalled in for a given bot. */
export function baseCurrencyForBot(bot: AssetType): CurrencyCode {
  return bot === "crypto" ? "USD" : "NZD";
}

/** Convert an amount from one currency into another via the NZD rate table. */
export function convertCurrency(
  amount: number,
  from: CurrencyCode,
  to: CurrencyCode,
  rates: FxRatesToNZD = BASELINE_FX_TO_NZD
): number {
  if (from === to) return amount;
  const fromRate = rates[from] ?? BASELINE_FX_TO_NZD[from];
  const toRate = rates[to] ?? BASELINE_FX_TO_NZD[to];
  const inNzd = amount * fromRate; // → NZD
  return inNzd / toRate; // NZD → target
}

/** Format a monetary value in a specific currency (e.g. "AU$1,234.50"). */
export function formatMoney(
  value: number,
  currency: CurrencyCode = "USD",
  opts: { compact?: boolean; decimals?: number } = {}
): string {
  const meta = CURRENCY_META[currency] ?? CURRENCY_META.USD;
  const abs = Math.abs(value);
  const decimals =
    opts.decimals ?? (abs > 0 && abs < 5 ? 4 : 2); // sub-$5 (e.g. some crypto) shows more precision
  try {
    const formatted = new Intl.NumberFormat(meta.locale, {
      minimumFractionDigits: opts.compact ? 0 : decimals,
      maximumFractionDigits: opts.compact ? 2 : decimals,
      notation: opts.compact ? "compact" : "standard",
    }).format(value);
    return `${meta.symbol}${formatted}`;
  } catch {
    return `${meta.symbol}${value.toFixed(decimals)}`;
  }
}

/** Short signed percent, e.g. "+2.4%". */
export function formatSignedPercent(value: number, decimals = 2): string {
  const s = value.toFixed(decimals);
  return `${value > 0 ? "+" : ""}${s}%`;
}
