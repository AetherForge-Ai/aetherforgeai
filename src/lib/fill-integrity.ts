/**
 * Fill-integrity guards — pure (client + server).
 *
 * Blocks saving holdings/fills when fill_price is absurd vs live spot
 * (the APT/UNI/ARB micro-price bug). Never "fixes" a tiny price by inflating qty.
 */

export type PriceSource =
  | "user_fill"
  | "broker_import"
  | "session_close"
  | "live_quote"
  | "bot_signal";

export type ExecutionStatus = "idea" | "paper" | "filled";

export type OrderSizing = "units" | "notional";

export const ADVISORY_NOTE =
  "AetherForge does not execute trades. Fill prices must match your broker.";

export const SANITY_RATIO_SOFT = 0.15; // 15%
export const SANITY_RATIO_HARD = 10; // 10× / 0.1×
export const REPAIR_CRYPTO_RATIO = 3; // flag if >3× or <1/3×

export interface FillSanityInput {
  ticker: string;
  quantity: number;
  fillPrice: number;
  liveSpot?: number | null;
  /** Cash/notional entered (same currency as fill) — crypto implied check. */
  cashOrNotional?: number | null;
  fees?: number;
  /** When NZD equity/metal: enforce cash_nzd == qty*fill - fees to the cent. */
  cashNzd?: number | null;
  fillCurrency?: string;
  assetType?: "stock" | "crypto" | "metal";
  /** User typed the live price exactly to unlock hard 10× override. */
  typedLiveOverride?: string | null;
  /** Explicit soft override (15%) after user confirms. */
  softOverrideConfirmed?: boolean;
  priceSource?: PriceSource | null;
  /** Prior session close — if fill equals this and trade is next session, flag. */
  priorClose?: number | null;
  tradeDate?: string | null; // yyyy-mm-dd Pacific/Auckland
  sessionCloseDate?: string | null;
}

export interface FillSanityResult {
  ok: boolean;
  blocked: boolean;
  code?:
    | "missing_fill"
    | "soft_mismatch"
    | "hard_mismatch"
    | "implied_mismatch"
    | "nzd_identity"
    | "bot_signal_as_fill"
    | "session_close_dating"
    | "inflate_qty_forbidden";
  message?: string;
  ratio?: number;
  liveValue?: number;
  storedValue?: number;
  impliedPrice?: number;
  suggestedQty?: number;
  suggestedPrice?: number;
  requiresTypedLive?: boolean;
  requiresSoftConfirm?: boolean;
}

function round(n: number, d = 6): number {
  const f = 10 ** d;
  return Math.round((n + Number.EPSILON) * f) / f;
}

function nearlyEqual(a: number, b: number, eps = 0.01): boolean {
  return Math.abs(a - b) <= eps;
}

/** Core value-ratio check: stored = qty*fill vs live = qty*spot. */
export function checkFillSanity(input: FillSanityInput): FillSanityResult {
  const ticker = (input.ticker || "").toUpperCase();
  const qty = Number(input.quantity) || 0;
  const fill = Number(input.fillPrice) || 0;
  const live = input.liveSpot != null ? Number(input.liveSpot) : null;
  const fees = Math.max(0, Number(input.fees) || 0);

  if (!(qty > 0) || !(fill > 0)) {
    return {
      ok: false,
      blocked: true,
      code: "missing_fill",
      message: `${ticker || "Asset"}: quantity and fill price must be greater than 0. ${ADVISORY_NOTE}`,
    };
  }

  // Never copy bot_signal onto fill unless user explicitly chose that source.
  if (input.priceSource === "bot_signal") {
    return {
      ok: false,
      blocked: true,
      code: "bot_signal_as_fill",
      message: `${ticker}: bot signal price cannot be used as fill_price. Type your broker fill, or choose price source "user_fill" / "live_quote" explicitly. ${ADVISORY_NOTE}`,
    };
  }

  // Session-close dating: if price_source is session_close, trade_date must be that session.
  if (
    input.priceSource === "session_close" &&
    input.tradeDate &&
    input.sessionCloseDate &&
    input.tradeDate !== input.sessionCloseDate
  ) {
    return {
      ok: false,
      blocked: true,
      code: "session_close_dating",
      message: `${ticker}: price_source=session_close requires trade_date=${input.sessionCloseDate}, not ${input.tradeDate}. Never book D-1 close on a D buy unless you choose previous close explicitly.`,
    };
  }

  // Flag prior-close-on-next-day (AVH.AX style) when fill ≈ priorClose and dates differ.
  if (
    input.priorClose &&
    input.priorClose > 0 &&
    input.tradeDate &&
    input.sessionCloseDate &&
    input.tradeDate > input.sessionCloseDate &&
    nearlyEqual(fill, input.priorClose, Math.max(0.005, input.priorClose * 0.002))
  ) {
    return {
      ok: false,
      blocked: true,
      code: "session_close_dating",
      message: `${ticker}: fill ${fill} equals prior session close (${input.priorClose} on ${input.sessionCloseDate}) but trade_date is ${input.tradeDate}. Choose previous close explicitly or enter the actual fill.`,
      requiresSoftConfirm: true,
    };
  }

  // NZD identity: cash_nzd == qty*fill - fees (to the cent) for NZD assets.
  if (
    input.fillCurrency === "NZD" &&
    input.cashNzd != null &&
    Number.isFinite(input.cashNzd)
  ) {
    const expected = round(qty * fill - fees, 2);
    const cash = round(Number(input.cashNzd), 2);
    if (!nearlyEqual(cash, expected, 0.01)) {
      return {
        ok: false,
        blocked: true,
        code: "nzd_identity",
        message: `${ticker}: NZD identity failed — cash_nzd ${cash} ≠ qty×fill−fees ${expected} (qty=${qty}, fill=${fill}, fees=${fees}).`,
      };
    }
  }

  // Crypto implied price from cash/qty.
  if (
    input.assetType === "crypto" &&
    input.cashOrNotional != null &&
    Number(input.cashOrNotional) > 0 &&
    qty > 0
  ) {
    const implied = Number(input.cashOrNotional) / qty;
    if (live && live > 0) {
      const impRatio = implied / live;
      if (Math.abs(impRatio - 1) > SANITY_RATIO_SOFT) {
        return {
          ok: false,
          blocked: true,
          code: "implied_mismatch",
          message: `${ticker}: implied price from cash/qty = ${round(implied, 8)} vs live ${live} (>${SANITY_RATIO_SOFT * 100}% off). Cash ${input.cashOrNotional}, qty ${qty}. Do not inflate qty to make NZD look right. ${ADVISORY_NOTE}`,
          impliedPrice: implied,
          ratio: impRatio,
          liveValue: qty * live,
          storedValue: qty * fill,
          suggestedQty: round(Number(input.cashOrNotional) / live, 6),
          suggestedPrice: live,
          requiresSoftConfirm: Math.abs(impRatio - 1) <= SANITY_RATIO_HARD - 1,
          requiresTypedLive: impRatio > SANITY_RATIO_HARD || impRatio < 1 / SANITY_RATIO_HARD,
        };
      }
    }
  }

  if (!(live && live > 0)) {
    // No live spot — allow save but still reject zero/negative (already handled).
    return { ok: true, blocked: false };
  }

  const liveValue = qty * live;
  const storedValue = qty * fill;
  const ratio = storedValue / liveValue;

  // Hard block: order-of-magnitude (10×) unless user types the live price.
  let typedLiveUnlocked = false;
  if (ratio > SANITY_RATIO_HARD || ratio < 1 / SANITY_RATIO_HARD) {
    const typed = (input.typedLiveOverride || "").trim();
    const typedOk =
      typed.length > 0 && nearlyEqual(Number(typed), live, Math.max(1e-8, live * 1e-6));
    if (!typedOk) {
      return {
        ok: false,
        blocked: true,
        code: "hard_mismatch",
        requiresTypedLive: true,
        ratio,
        liveValue,
        storedValue,
        suggestedQty: round(Math.abs(storedValue) / live, 6),
        suggestedPrice: live,
        message: `${ticker}: fill ${fill} vs live ${live} is ${round(ratio, 4)}× (stored value ${round(storedValue, 2)} vs live value ${round(liveValue, 2)}). Blocked. To override, type the live price (${live}) exactly. Never inflate quantity to keep cash looking right. ${ADVISORY_NOTE}`,
      };
    }
    typedLiveUnlocked = true;
  }

  // Soft block: >15% — needs explicit confirm (typed-live hard unlock counts).
  if (Math.abs(ratio - 1) > SANITY_RATIO_SOFT) {
    if (!input.softOverrideConfirmed && !typedLiveUnlocked) {
      return {
        ok: false,
        blocked: true,
        code: "soft_mismatch",
        requiresSoftConfirm: true,
        ratio,
        liveValue,
        storedValue,
        suggestedQty: round(Math.abs(storedValue) / live, 6),
        suggestedPrice: live,
        message: `${ticker}: fill ${fill} is >${SANITY_RATIO_SOFT * 100}% from live ${live} (ratio ${round(ratio, 4)}). Stored value ${round(storedValue, 2)} vs live ${round(liveValue, 2)}. Confirm to override, or correct fill/qty. ${ADVISORY_NOTE}`,
      };
    }
  }

  return {
    ok: true,
    blocked: false,
    ratio,
    liveValue,
    storedValue,
    suggestedQty: round(Math.abs(storedValue) / live, 6),
    suggestedPrice: live,
  };
}

/** Propose repair without touching cash_nzd. */
export function proposeRepair(opts: {
  quantity: number;
  fillPrice: number;
  liveSpot: number;
  nativeNotional?: number | null;
}): { newQty: number; newPrice: number; note: string } {
  const live = opts.liveSpot;
  const notional =
    opts.nativeNotional != null && opts.nativeNotional > 0
      ? Math.abs(opts.nativeNotional)
      : Math.abs(opts.quantity * opts.fillPrice);
  const newQty = round(notional / live, 6);
  return {
    newQty,
    newPrice: live,
    note: `Proposed repair: qty ${opts.quantity}→${newQty}, fill ${opts.fillPrice}→${live}; cash_nzd untouched. Originals kept in notes/audit.`,
  };
}

export function isExtremeCryptoMismatch(qty: number, stored: number, live: number): boolean {
  if (!(qty > 0) || !(stored > 0) || !(live > 0)) return false;
  const ratio = (qty * stored) / (qty * live);
  return ratio > REPAIR_CRYPTO_RATIO || ratio < 1 / REPAIR_CRYPTO_RATIO;
}

/** Auckland calendar date yyyy-mm-dd. */
export function aucklandDateISO(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Pacific/Auckland",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function aucklandDateTimeISO(d: Date = new Date()): string {
  // en-NZ with Auckland → readable; also provide ISO-like local stamp
  const parts = new Intl.DateTimeFormat("en-NZ", {
    timeZone: "Pacific/Auckland",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}+12:00`;
}
