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

/** Input-friendly price text. Amounts from $1 use 2 decimals. Sub-dollar keeps precision. */
export function formatPriceInput(value: number): string {
  if (!Number.isFinite(value)) return "";
  if (Math.abs(value) >= 1) return value.toFixed(2);
  const digits = adaptiveFractionDigits(value);
  const text = value.toFixed(digits);
  return text.replace(/(\.\d*?[1-9])0+$/, "$1").replace(/\.0+$/, "");
}

const DISPLAY_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function displayDateParts(input: string | Date): { day: number; month: number; year: number } | null {
  if (typeof input === "string") {
    const ymd = /^(\d{4})-(\d{2})-(\d{2})/.exec(input.trim());
    if (ymd) return { year: Number(ymd[1]), month: Number(ymd[2]), day: Number(ymd[3]) };
  }
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-NZ", {
    timeZone: "Pacific/Auckland",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);
  if (!year || !month || !day) return null;
  return { year, month, day };
}

/**
 * Calendar date as '4 Oct 2026'. A yyyy-mm-dd string is that civil date,
 * not UTC midnight (which would show the previous day in New Zealand).
 * The day is never padded, so 4 October is '4 Oct 2026'.
 */
export function formatDisplayDate(input?: string | Date | null): string {
  if (input == null || input === "") return "—";
  const parts = displayDateParts(input);
  if (!parts || parts.month < 1 || parts.month > 12) return "—";
  return `${parts.day} ${DISPLAY_MONTHS[parts.month - 1]} ${parts.year}`;
}

/** NZD received for 1 unit of a foreign currency, shown to 4 decimals. */
export function roundFxRate(value: number): number {
  if (!(value > 0) || !Number.isFinite(value)) return value;
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}

export function formatFxInput(value: number): string {
  if (!(value > 0) || !Number.isFinite(value)) return "";
  return roundFxRate(value).toFixed(4);
}

/**
 * A rate that was saved on the ledger row, to 4 decimals.
 * Missing, blank, and non-positive values stay blank so callers can show a dash
 * instead of inventing NZD = 1.
 */
export function formatSavedFx(value: unknown): string {
  if (value == null || value === "") return "";
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return formatFxInput(n);
}

/** Quantities in messages, with a thousands separator. 9824 is '9,824'. */
export function formatQuantity(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const abs = Math.abs(value);
  const maximumFractionDigits = abs > 0 && abs < 1 ? 8 : 4;
  return new Intl.NumberFormat("en-NZ", { maximumFractionDigits, useGrouping: true }).format(value);
}

/** NZ dollars to 2 decimal places, e.g. NZ$2.20 or -NZ$21,598.34. */
export function formatNzd(value: number): string {
  return formatMoney(value, "NZD", { decimals: 2 });
}

/** Signed money. A reduction keeps the minus; a gain gets a plus. Zero is NZ$0.00 with no plus. */
export function formatSignedMoney(value: number, currency: CurrencyCode = "NZD"): string {
  const decimals = currency === "NZD" || Math.abs(value) >= 1 ? 2 : undefined;
  const text = formatMoney(value, currency, decimals != null ? { decimals } : {});
  if (value > 0) return `+${text}`;
  return text;
}

/** Native amount, with the NZ dollar value beside it when the currency is not NZD. */
export function formatMoneyWithNzd(amount: number, currency: CurrencyCode, nzd: number): string {
  const decimals = currency === "NZD" || Math.abs(amount) >= 1 ? 2 : undefined;
  const native = formatMoney(amount, currency, decimals != null ? { decimals } : {});
  if (currency === "NZD") return native;
  return `${native} · ${formatNzd(nzd)}`;
}

/** Format a monetary value in a specific currency (e.g. "AU$1,234.50"). */
export function formatMoney(
  value: number,
  currency: CurrencyCode = "USD",
  opts: { compact?: boolean; decimals?: number } = {}
): string {
  const meta = CURRENCY_META[currency] ?? CURRENCY_META.USD;
  const abs = Math.abs(value);
  // Book money from $1 is always 2 decimals (NZ$2.20, not NZ$2.2000).
  // Sub-dollar prints keep extra places so a fraction of a cent is not $0.00.
  const decimals = opts.decimals ?? (abs >= 1 ? 2 : adaptiveFractionDigits(value));
  // Sub-dollar prices: cap the fraction at the adaptive width but don't force
  // trailing zeros out to 8 places. $1 and up stay fixed-width.
  const minDigits = opts.compact ? 0 : abs > 0 && abs < 1 ? Math.min(2, decimals) : decimals;
  const maxDigits = opts.compact ? Math.min(2, decimals) : decimals;
  const sign = value < 0 ? "-" : "";
  try {
    const formatted = new Intl.NumberFormat(meta.locale, {
      minimumFractionDigits: minDigits,
      maximumFractionDigits: maxDigits,
      notation: opts.compact ? "compact" : "standard",
    }).format(abs);
    return `${sign}${meta.symbol}${formatted}`;
  } catch {
    return `${sign}${meta.symbol}${abs.toFixed(decimals)}`;
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

/** US dollars received for 1 NZD, from the same "1 unit → NZD" table. */
export function usdPerNzd(rates: FxRatesToNZD = BASELINE_FX_TO_NZD): number {
  return 1 / ensureNzdPerUsd(rates.USD);
}

/** Daily FX caption, e.g. "Daily rate · 4 Oct 2026". The clock is not part of a daily rate. */
export function formatDailyRate(asOfIso: string): string {
  const date = new Date(asOfIso);
  if (Number.isNaN(date.getTime())) return "Daily rate";
  const wall = date.toLocaleDateString("en-NZ", {
    timeZone: "Pacific/Auckland",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return `Daily rate · ${wall}`;
}

/** Auckland wall time for the single FX snapshot, e.g. "4 Oct 2026, 3:06 pm NZST". */
export function formatFxAsOf(asOfIso: string): string {
  const date = new Date(asOfIso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-NZ", {
    timeZone: "Pacific/Auckland",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

/**
 * One caption for every public US$ figure: the converted amount, the single
 * NZD→USD rate, and the time that rate was taken.
 */
export function formatUsdWithRate(
  nzd: number,
  rates: FxRatesToNZD,
  asOfIso: string,
  opts: { decimals?: number; suffix?: string } = {}
): string {
  // The printed rate is the rate used. Four decimal places is what the caption shows.
  const rate = Number(usdPerNzd(rates).toFixed(4));
  const amount = formatMoney(nzd * rate, "USD", { decimals: opts.decimals ?? 2 });
  const taken = formatDailyRate(asOfIso);
  const suffix = opts.suffix ?? "";
  return `≈ ${amount}${suffix} · 1 NZD = US$${rate.toFixed(4)}${taken ? ` · ${taken}` : ""}`;
}

/** Short signed percent, e.g. "+2.4%". */
export function formatSignedPercent(value: number, decimals = 2): string {
  const s = value.toFixed(decimals);
  return `${value > 0 ? "+" : ""}${s}%`;
}
