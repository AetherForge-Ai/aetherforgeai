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
  return Math.min(12, Math.max(2, sig - exp - 1));
}

/**
 * Persist a unit price. Stored fills keep at least 6 decimal places, and more
 * when the price is sub-cent, so 17.456789, 12.345, 0.00001 and 0.0000040399
 * all stay intact. Display formatting is separate and stays adaptive.
 * pull-check:qa-2026-10-10-urgent-u1-u2-u4
 */
export function roundUnitPrice(n: number): number {
  if (!Number.isFinite(n)) return n;
  const abs = Math.abs(n);
  if (abs === 0) return 0;
  const digits = Math.max(6, adaptiveFractionDigits(abs));
  const f = 10 ** digits;
  return Math.round((n + Number.EPSILON) * f) / f;
}

/**
 * A DEX or crypto quote, unchanged when it is a positive finite price.
 * Quote normalisation must not round 0.0000040399 up to 0.01.
 */
export function normaliseUnitPrice(value: number | null | undefined): number | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || !(n > 0)) return null;
  return n;
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
 * The day is never padded, so 4 October is '4 Oct 2026'. Month is always
 * the three-letter form ('Sep', never 'Sept').
 */
export function formatDisplayDate(input?: string | Date | null): string {
  if (input == null || input === "") return "—";
  const parts = displayDateParts(input);
  if (!parts || parts.month < 1 || parts.month > 12) return "—";
  return `${parts.day} ${DISPLAY_MONTHS[parts.month - 1]} ${parts.year}`;
}

/**
 * Auckland wall clock as '10 Oct 2026, 3:47 pm'. Hour is not zero-padded.
 * The month comes from the same list as formatDisplayDate, so server and
 * client cannot disagree on 'Sep' versus 'Sept'.
 */
export function formatDisplayDateTime(input?: string | Date | null): string {
  if (input == null || input === "") return "—";
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return "—";
  const parts = new Intl.DateTimeFormat("en-NZ", {
    timeZone: "Pacific/Auckland",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    hourCycle: "h12",
  }).formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  const year = Number(read("year"));
  const month = Number(read("month"));
  const day = Number(read("day"));
  let hour = Number(read("hour"));
  const minute = read("minute").padStart(2, "0");
  const period = read("dayPeriod").replace(/\./g, "").toLowerCase();
  if (!year || !month || !day || month < 1 || month > 12 || !Number.isFinite(hour)) return "—";
  if (hour === 0) hour = 12;
  const suffix = period.startsWith("a") ? "am" : period.startsWith("p") ? "pm" : period;
  return `${day} ${DISPLAY_MONTHS[month - 1]} ${year}, ${hour}:${minute} ${suffix}`.trim();
}

/** Auckland clock only, e.g. '3:47 pm'. No leading zero on the hour. */
export function formatDisplayClock(input?: string | Date | null): string {
  const full = formatDisplayDateTime(input);
  const comma = full.indexOf(", ");
  return comma === -1 ? full : full.slice(comma + 2);
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

/**
 * Book money to the cent. A value that rounds to zero is 0, never -0,
 * so a display cannot print '-NZ$0.00' or '-0.00%'.
 */
export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
  return rounded === 0 ? 0 : rounded;
}

/**
 * Round at an explicit decimal width. Two places and under use roundMoney.
 * Wider widths keep sub-cent digits (0.0000040399 at 8 places stays 0.00000404)
 * and still collapse -0 to 0.
 */
function roundAtDecimals(value: number, decimals: number): number {
  if (!Number.isFinite(value)) return 0;
  if (decimals <= 2) return roundMoney(value);
  const rounded = Number(value.toFixed(decimals));
  return rounded === 0 ? 0 : rounded;
}

/** Auckland civil day. A yyyy-mm-dd string is that day; a timestamp is Auckland. */
function aucklandCivilDay(input: string | Date): string {
  if (typeof input === "string") {
    const text = input.trim();
    if (!text) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
    const date = new Date(text);
    if (Number.isNaN(date.getTime())) return "";
    return aucklandCivilDay(date);
  }
  if (Number.isNaN(input.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Pacific/Auckland",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(input);
}

/**
 * True when two unit prices are the same after the stored precision
 * (at least 6 decimal places). A 2-decimal print match is not enough:
 * 10.000 and 10.004 both show as 10.00, and 100,000 shares times that
 * gap is a real gain.
 */
export function sameQuotedUnit(paid: number, mark: number): boolean {
  if (!(paid > 0) || !(mark > 0) || !Number.isFinite(paid) || !Number.isFinite(mark)) return false;
  return roundUnitPrice(paid) === roundUnitPrice(mark);
}

/**
 * Zero a gain only when the stored unit price still matches the quote and
 * the position was filled on this Auckland day. An older lot, or any lot
 * whose prices differ inside 6 decimal places, keeps the full-precision gain.
 */
export function freshQuotedFill(
  paid: number,
  mark: number,
  purchaseDate: string | null | undefined,
  now: Date = new Date()
): boolean {
  if (!sameQuotedUnit(paid, mark)) return false;
  const filled = aucklandCivilDay(String(purchaseDate ?? ""));
  if (!filled) return false;
  return filled === aucklandCivilDay(now);
}

/**
 * Native position gain. NZ$ amounts, and anything from one cent, round to
 * the cent. A non-NZ$ gain under one cent keeps its digits so a token move
 * is not stored as 0. Negative zero is 0.
 */
export function roundPositionGain(value: number, currency: CurrencyCode = "NZD"): number {
  if (!Number.isFinite(value) || value === 0) return 0;
  if (currency !== "NZD" && Math.abs(value) < 0.01) return value;
  return roundMoney(value);
}

/** NZ dollars to 2 decimal places, e.g. NZ$2.20 or -NZ$21,598.34. */
export function formatNzd(value: number): string {
  return formatMoney(roundMoney(value), "NZD", { decimals: 2 });
}

/**
 * Signed money. NZ$ totals stay at 2 decimal places. A non-NZ$ native gain
 * under one cent uses the adaptive unit format, so it is not 'US$0.00'.
 * Zero has no sign.
 */
export function formatSignedMoney(value: number, currency: CurrencyCode = "NZD"): string {
  if (currency !== "NZD" && Number.isFinite(value) && Math.abs(value) > 0 && Math.abs(value) < 0.01) {
    const text = formatMoney(value, currency);
    return value > 0 ? `+${text}` : text;
  }
  const rounded = roundMoney(value);
  const text = formatMoney(rounded, currency, { decimals: 2 });
  if (rounded > 0) return `+${text}`;
  return text;
}

/** Allocation drift in percentage points, e.g. '-55.0pp'. Zero is never negative. */
export function formatDriftPp(value: number, decimals = 1): string {
  if (!Number.isFinite(value)) return `${(0).toFixed(decimals)}pp`;
  const rounded = Number(value.toFixed(decimals));
  if (rounded === 0) return `${(0).toFixed(decimals)}pp`;
  const sign = rounded > 0 ? "+" : "";
  return `${sign}${rounded.toFixed(decimals)}pp`;
}

/**
 * Unit price. Sub-cent amounts, including the NZ$ equivalent of a unit, keep
 * their significant digits. NZ$0.00 is only used when the unit price is zero.
 */
export function formatUnitPrice(value: number, currency: CurrencyCode = "USD"): string {
  if (!Number.isFinite(value)) return formatMoney(0, currency, { decimals: 2 });
  // Under $1 the adaptive width keeps a sub-cent print. From $1 the existing
  // scale applies: 4 decimals under $5, 2 decimals from $5.
  return formatMoney(value, currency);
}

/** True when an NZ$ figure is a non-zero unit price under one cent. */
function subCentUnit(value: number): boolean {
  const abs = Math.abs(value);
  return abs > 0 && abs < 0.01;
}

/** Native amount, with the NZ dollar value beside it when the currency is not NZD. */
export function formatMoneyWithNzd(amount: number, currency: CurrencyCode, nzd: number): string {
  const native = subCentUnit(amount) || (currency !== "NZD" && Math.abs(amount) > 0 && Math.abs(amount) < 1)
    ? formatUnitPrice(amount, currency)
    : formatMoney(amount, currency, { decimals: 2 });
  if (currency === "NZD") return native;
  const nzdText = subCentUnit(nzd) ? formatUnitPrice(nzd, "NZD") : formatNzd(nzd);
  return `${native} · ${nzdText}`;
}

/** Format a monetary value in a specific currency (e.g. "AU$1,234.50"). */
export function formatMoney(
  value: number,
  currency: CurrencyCode = "USD",
  opts: { compact?: boolean; decimals?: number } = {}
): string {
  const meta = CURRENCY_META[currency] ?? CURRENCY_META.USD;
  const signed = opts.decimals == null ? value : roundAtDecimals(value, opts.decimals);
  const abs = Math.abs(signed);
  // Book money from $1 is always 2 decimals (NZ$2.20, not NZ$2.2000).
  // Sub-dollar prints keep extra places so a fraction of a cent is not $0.00.
  const decimals = opts.decimals ?? (abs >= 1 ? 2 : adaptiveFractionDigits(signed));
  // Sub-dollar prices: cap the fraction at the adaptive width but don't force
  // trailing zeros out to 8 places. $1 and up stay fixed-width.
  const minDigits = opts.compact ? 0 : abs > 0 && abs < 1 ? Math.min(2, decimals) : decimals;
  const maxDigits = opts.compact ? Math.min(2, decimals) : decimals;
  const sign = signed < 0 ? "-" : "";
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
  const wall = formatDisplayDate(asOfIso);
  if (wall === "—") return "Daily rate";
  return `Daily rate · ${wall}`;
}

/** Auckland wall time for the single FX snapshot, e.g. "4 Oct 2026, 3:06 pm". */
export function formatFxAsOf(asOfIso: string): string {
  const wall = formatDisplayDateTime(asOfIso);
  return wall === "—" ? "" : wall;
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

/** Short signed percent, e.g. "+2.4%". A figure that rounds to zero has no minus. */
export function formatSignedPercent(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return `${(0).toFixed(decimals)}%`;
  const rounded = Number(value.toFixed(decimals));
  if (rounded === 0) return `${(0).toFixed(decimals)}%`;
  const sign = rounded > 0 ? "+" : "";
  return `${sign}${rounded.toFixed(decimals)}%`;
}
