/**
 * Crypto holdings live-price helpers.
 *
 * Digital assets trade 24/7. Nothing in this module consults NZX, ASX, or US
 * cash-session hours, and a quote an equity feed labelled "close" is still a
 * live crypto print. Purchase-price P/L uses the stored average cost, which
 * already includes the ~1% crypto buy fee — do not apply that fee again.
 */

export const CRYPTO_LIVE_POLL_MS = 45_000;
/** One shared server snapshot so holdings, alerts, and refresh don't each hit upstream. */
export const CRYPTO_SNAPSHOT_TTL_MS = 30_000;

export interface CryptoSpot {
  price: number;
  changePct: number;
}

export interface CryptoAlertThresholds {
  /** Configured loss vs purchase, in percent (3 means sell at −3%). Not rewritten here. */
  trimTriggerDipPct?: number | null;
  /** Absolute floor. Evaluated against the live price when set. */
  hardSellPrice?: number | null;
  /** Lower bound of the take-profit / trim band vs purchase (e.g. 8). */
  takeProfitMinPct?: number | null;
  /** Upper bound of that band (e.g. 12). Guidance only — trimming starts at the lower bound. */
  takeProfitMaxPct?: number | null;
}

export interface CryptoAlertEvaluation {
  /** Unrealised P/L % vs purchase. Null when purchase or price is missing. */
  pnlPct: number | null;
  /** Live price is at/under the hard floor, or P/L has reached the configured loss vs purchase. */
  sell: boolean;
  /** Unrealised gain has reached the configured trim / take-profit band vs purchase. */
  trimming: boolean;
}

const SYMBOL_LIMIT = 40;

/** Batch, dedupe, and drop equity tickers (anything with an exchange suffix). */
export function normalizeCryptoSymbols(symbols: string[], limit = SYMBOL_LIMIT): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of symbols) {
    const original = String(raw || "").trim().toUpperCase();
    if (!original || original.includes(".")) continue;
    const t = original.replace(/-?USD[T]?$/, "").replace(/[^A-Z0-9]/g, "");
    if (!t || t.length > 12 || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= limit) break;
  }
  out.sort();
  return out;
}

/**
 * Equity feeds sometimes mark a print `close` when the cash session is shut.
 * Crypto has no such session — always surface the price as live.
 */
export function stampCryptoQuoteLive<T extends { price: number; changePct?: number; asOf?: "live" | "close" }>(
  quote: T
): T & { asOf: "live"; changePct: number } {
  return {
    ...quote,
    changePct: Number.isFinite(quote.changePct) ? Number(quote.changePct) : 0,
    asOf: "live",
  };
}

/** HH:MM:SS in Pacific/Auckland (NZST/NZDT as appropriate for the instant). */
export function formatAucklandHms(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Pacific/Auckland",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("hour")}:${get("minute")}:${get("second")}`;
}

/** Unrealised P/L percent vs purchase. Purchase already includes the crypto fee. */
export function unrealisedPctVsPurchase(purchase: number, current: number): number | null {
  const cost = Number(purchase);
  const mark = Number(current);
  if (!(cost > 0) || !(mark > 0) || !Number.isFinite(cost) || !Number.isFinite(mark)) return null;
  return ((mark - cost) / cost) * 100;
}

function finiteNumber(v: number | null | undefined): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return v;
}

/**
 * Evaluate a crypto alert from the live mark and the thresholds stored on the
 * alert. Threshold numbers are never substituted — a member who set −3% / +8–12%
 * (or any other band) is evaluated exactly on those figures.
 */
export function evaluateCryptoAlert(input: CryptoAlertThresholds & {
  purchasePrice?: number | null;
  currentPrice?: number | null;
}): CryptoAlertEvaluation {
  const current = Number(input.currentPrice);
  const purchase = Number(input.purchasePrice);
  const pnlPct = unrealisedPctVsPurchase(purchase, current);
  const dip = finiteNumber(input.trimTriggerDipPct);
  const hard = finiteNumber(input.hardSellPrice);
  const tpMin = finiteNumber(input.takeProfitMinPct);
  const tpMax = finiteNumber(input.takeProfitMaxPct);

  const sellByFloor = hard != null && hard > 0 && current > 0 && current <= hard;
  // 0 is "not configured" — a 0% loss rule would fire on every flat print.
  const sellByPct = pnlPct != null && dip != null && dip !== 0 && pnlPct <= -Math.abs(dip);
  const bandStart = tpMin != null ? tpMin : tpMax;
  const trimming = pnlPct != null && bandStart != null && pnlPct >= bandStart;

  return {
    pnlPct,
    sell: sellByFloor || sellByPct,
    trimming,
  };
}

/**
 * Overlay one shared spot snapshot onto crypto holdings. Missing quotes keep
 * the stored price (no zero-flash). Non-crypto rows are copied through.
 * Returns the same array reference when nothing changed.
 */
export function applyLiveCryptoPrices<T extends { ticker: string; current_price: number; asset_type?: string | null }>(
  holdings: T[],
  quotes: Record<string, { price: number }> | null | undefined
): T[] {
  if (!quotes || !holdings.length) return holdings;
  let changed = false;
  const next = holdings.map((h) => {
    if ((h.asset_type || "stock") !== "crypto") return h;
    const q = quotes[String(h.ticker || "").toUpperCase()];
    const price = Number(q?.price);
    if (!(price > 0) || !Number.isFinite(price)) return h;
    const stored = Number(h.current_price) || 0;
    if (stored > 0 && Math.abs(price - stored) <= Math.max(1e-8, Math.abs(stored) * 1e-8)) return h;
    changed = true;
    return { ...h, current_price: price };
  });
  return changed ? next : holdings;
}

export interface CryptoPollState {
  quotes: Record<string, CryptoSpot>;
  updatedAt: number | null;
}

/**
 * Successful poll: merge positive prices and advance the clock.
 * A hidden tab or an open Buy/Add dialog must not call this.
 */
export function applyCryptoPollSuccess(
  prev: CryptoPollState,
  incoming: Record<string, { price: number; changePct?: number }>,
  at: number
): CryptoPollState {
  const quotes = { ...prev.quotes };
  for (const [raw, q] of Object.entries(incoming || {})) {
    const key = String(raw || "").toUpperCase();
    const price = Number(q?.price);
    if (!key || !(price > 0) || !Number.isFinite(price)) continue;
    const changePct = Number(q.changePct);
    quotes[key] = { price, changePct: Number.isFinite(changePct) ? changePct : 0 };
  }
  return { quotes, updatedAt: at };
}

/** Skip the network when the tab is hidden or the Buy/Add dialog is open. */
export function shouldFetchCryptoPoll(opts: { hidden: boolean; dialogOpen: boolean; hasSymbols: boolean }): boolean {
  return opts.hasSymbols && !opts.hidden && !opts.dialogOpen;
}
