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
 * but portfolio totals (including the crypto overview) are aggregated in NZD
 * by default — AUD and USD amounts are converted with live FX (baseline
 * fallback). Crypto unit prices stay in USD; the NZ$ book uses usdToNzd.
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
 * Precious metals (GOLD/SILVER) are always priced in NZD per troy ounce.
 * Crypto is always USD. Stocks derive from the exchange suffix.
 */
export function currencyForTicker(
  ticker: string,
  assetType: AssetType | "metal" = "stock"
): CurrencyCode {
  const t = (ticker || "").trim().toUpperCase();
  // Gold & silver are tracked in NZD/oz regardless of how they're categorised.
  if (assetType === "metal" || t === "GOLD" || t === "SILVER") return "NZD";
  if (assetType === "crypto") return "USD";
  if (t.endsWith(".NZ") || t.endsWith(".NZX")) return "NZD";
  if (t.endsWith(".AX") || t.endsWith(".ASX")) return "AUD";
  return "USD"; // US listings carry no suffix
}

/** The currency a whole portfolio is totalled in for a given bot. */
export function baseCurrencyForBot(bot: AssetType): CurrencyCode {
  return bot === "crypto" ? "USD" : "NZD";
}

/**
 * 1 USD → NZD. A figure below 1 is the NZD→USD quote (e.g. 0.57 or 0.71) and
 * must not be used as a multiplier — that is the inversion that booked
 * ~NZ$83 for a ~US$117 notional. Flip it so the book always multiplies by
 * how many NZD one USD buys (baseline ~1.67, live often ~1.7).
 */
export function ensureNzdPerUsd(rate: number): number {
  if (!(rate > 0) || !Number.isFinite(rate)) return BASELINE_FX_TO_NZD.USD;
  return rate < 1 ? 1 / rate : rate;
}

/**
 * 1 AUD → NZD. Unlike USD, a rate below 1 can be legitimate (NZD has traded
 * through parity with AUD), so this does not flip sub-1 quotes. Callers that
 * start from the er-api NZD base must invert once before passing the rate.
 */
export function ensureNzdPerAud(rate: number): number {
  if (!(rate > 0) || !Number.isFinite(rate)) return BASELINE_FX_TO_NZD.AUD;
  return rate;
}

/** Force the rate table into "1 unit → NZD", even if a caller passed the raw er-api quote. */
export function normalizeFxRates(rates: FxRatesToNZD = BASELINE_FX_TO_NZD): FxRatesToNZD {
  return {
    NZD: 1,
    AUD: ensureNzdPerAud(rates?.AUD),
    USD: ensureNzdPerUsd(rates?.USD),
  };
}

/**
 * Convert a US-dollar amount into NZ dollars.
 * `nzdPerUsd` is NZD received for 1 USD. A sub-1 value is treated as the
 * opposite quote and inverted before multiplying.
 */
export function usdToNzd(amountUsd: number, nzdPerUsd: number = BASELINE_FX_TO_NZD.USD): number {
  return amountUsd * ensureNzdPerUsd(nzdPerUsd);
}

/** Convert an Australian-dollar amount into NZ dollars. */
export function audToNzd(amountAud: number, nzdPerAud: number = BASELINE_FX_TO_NZD.AUD): number {
  return amountAud * ensureNzdPerAud(nzdPerAud);
}

/** Native trade currency → NZD using the named helpers (never the raw NZD→USD quote). */
export function nativeToNzd(
  amount: number,
  currency: CurrencyCode,
  rates: FxRatesToNZD = BASELINE_FX_TO_NZD
): number {
  const table = normalizeFxRates(rates);
  if (currency === "NZD") return amount;
  if (currency === "USD") return usdToNzd(amount, table.USD);
  return audToNzd(amount, table.AUD);
}

/** Convert an amount from one currency into another via the NZD rate table. */
export function convertCurrency(
  amount: number,
  from: CurrencyCode,
  to: CurrencyCode,
  rates: FxRatesToNZD = BASELINE_FX_TO_NZD
): number {
  if (from === to) return amount;
  const table = normalizeFxRates(rates);
  const inNzd = nativeToNzd(amount, from, table);
  if (to === "NZD") return inNzd;
  const toRate = table[to];
  return inNzd / toRate;
}

/**
 * Decimal places for a price. Amounts under $1 keep 4 significant figures
 * down to one cent, and 6 below that, so a sub-cent print never collapses
 * to $0.00. Prices from $1 keep the usual 2 (4 between $1 and $5).
 */
export function adaptiveFractionDigits(value: number): number {
  const abs = Math.abs(value);
  if (!Number.isFinite(abs) || abs === 0) return 2;
  if (abs >= 1) return abs < 5 ? 4 : 2;
  const sig = abs >= 0.01 ? 4 : 6;
  const exp = Math.floor(Math.log10(abs));
  return Math.min(10, Math.max(2, sig - exp - 1));
}

/** Input-friendly price text (hard-sell seeds, etc.) that keeps sub-cent precision. */
export function formatPriceInput(value: number): string {
  if (!Number.isFinite(value)) return "";
  const digits = adaptiveFractionDigits(value);
  const text = value.toFixed(digits);
  if (Math.abs(value) >= 1) return text;
  return text.replace(/(\.\d*?[1-9])0+$/, "$1").replace(/\.0+$/, "");
}

/** Format a monetary value in a specific currency (e.g. "AU$1,234.50"). */
export function formatMoney(
  value: number,
  currency: CurrencyCode = "USD",
  opts: { compact?: boolean; decimals?: number } = {}
): string {
  const meta = CURRENCY_META[currency] ?? CURRENCY_META.USD;
  const abs = Math.abs(value);
  const decimals = opts.decimals ?? adaptiveFractionDigits(value);
  // Sub-dollar prices: cap the fraction at the adaptive width but don't force
  // trailing zeros out to 8 places. $1 and up stay fixed-width.
  const minDigits = opts.compact ? 0 : abs > 0 && abs < 1 ? Math.min(2, decimals) : decimals;
  const maxDigits = opts.compact ? Math.min(2, decimals) : decimals;
  try {
    const formatted = new Intl.NumberFormat(meta.locale, {
      minimumFractionDigits: minDigits,
      maximumFractionDigits: maxDigits,
      notation: opts.compact ? "compact" : "standard",
    }).format(value);
    return `${meta.symbol}${formatted}`;
  } catch {
    return `${meta.symbol}${value.toFixed(decimals)}`;
  }
}

/**
 * Convert an NZD amount into its USD equivalent using the "1 unit → NZD" table.
 * All of AetherForge's plan/product prices are billed in NZD; this powers the
 * "≈ US$X" reference shown alongside every price.
 */
export function nzdToUsd(nzd: number, rates: FxRatesToNZD = BASELINE_FX_TO_NZD): number {
  return convertCurrency(nzd, "NZD", "USD", rates);
}

/**
 * Format the USD equivalent of an NZD price as an approximate secondary label,
 * e.g. "≈ US$41". Defaults to whole dollars since it's an FX reference that
 * naturally drifts; pass `decimals` for finer precision.
 */
export function formatUsdApprox(
  nzd: number,
  rates: FxRatesToNZD = BASELINE_FX_TO_NZD,
  opts: { decimals?: number } = {}
): string {
  return `≈ ${formatMoney(nzdToUsd(nzd, rates), "USD", { decimals: opts.decimals ?? 0 })}`;
}

/** Short signed percent, e.g. "+2.4%". */
export function formatSignedPercent(value: number, decimals = 2): string {
  const s = value.toFixed(decimals);
  return `${value > 0 ? "+" : ""}${s}%`;
}
