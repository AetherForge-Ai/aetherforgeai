/**
 * Session-print checks for Stox and Koins.
 * A "% today" figure that does not match the prior daily close is replaced
 * with that close-to-close change, or withheld when no prior close exists.
 * Prices are delayed public prints. This is not a licensed exchange feed.
 */

export const SESSION_BASIS_GAP_PP = 3;

/** One-way age limits for refusing a directional scenario. */
export const STOCK_QUOTE_MAX_AGE_MS = 5 * 24 * 60 * 60 * 1000;
export const CRYPTO_QUOTE_MAX_AGE_MS = 36 * 60 * 60 * 1000;

export function sessionChangeFromPrior(price: number, priorClose: number): number | null {
  if (!(priorClose > 0) || !Number.isFinite(price) || !Number.isFinite(priorClose)) return null;
  const change = ((price - priorClose) / priorClose) * 100;
  return Number.isFinite(change) ? change : null;
}

/**
 * Prefer the move implied by the prior daily close when the reported percent
 * disagrees by more than 3 points. A real large move that matches the prior
 * close is kept.
 */
export function reconcileSessionChange(
  price: number,
  reportedChangePct: number,
  priorClose: number | null
): { changePct: number; replaced: boolean } {
  const reported = Number.isFinite(reportedChangePct) ? reportedChangePct : 0;
  const official = priorClose == null ? null : sessionChangeFromPrior(price, priorClose);
  if (official == null) return { changePct: reported, replaced: false };
  if (Math.abs(official - reported) > SESSION_BASIS_GAP_PP) {
    return { changePct: official, replaced: true };
  }
  return { changePct: reported, replaced: false };
}

/**
 * Drop a last intraday tick that is far from the official session price, and
 * drop a percent that disagrees with the vendor's own session percent.
 */
export function preferOfficialSession(input: {
  barPrice: number | null;
  officialPrice: number | null;
  officialChangePct: number | null;
  previousClose: number | null;
  barChangePct: number | null;
}): { price: number; changePct: number; replaced: boolean } | null {
  const officialPrice = input.officialPrice != null && input.officialPrice > 0 ? input.officialPrice : null;
  const barPrice = input.barPrice != null && input.barPrice > 0 ? input.barPrice : null;
  let price = barPrice ?? officialPrice;
  if (price == null) return null;
  let replaced = false;
  if (barPrice != null && officialPrice != null && Math.abs(barPrice - officialPrice) / officialPrice > 0.03) {
    price = officialPrice;
    replaced = true;
  }
  const fromPrior = input.previousClose != null ? sessionChangeFromPrior(price, input.previousClose) : null;
  let change = fromPrior ?? (input.barChangePct != null && Number.isFinite(input.barChangePct) ? input.barChangePct : 0);
  if (
    input.officialChangePct != null &&
    Number.isFinite(input.officialChangePct) &&
    Math.abs(change - input.officialChangePct) > SESSION_BASIS_GAP_PP
  ) {
    change = input.officialChangePct;
    replaced = true;
  }
  if (fromPrior != null && Math.abs(change - fromPrior) > SESSION_BASIS_GAP_PP) {
    change = fromPrior;
    replaced = true;
  }
  return { price, changePct: change, replaced };
}

/** Withhold a large percent when nothing confirms it. A confirmed prior close is not withheld. */
export function withholdUnconfirmedMove(changePct: number, confirmed: boolean): boolean {
  return !confirmed && Number.isFinite(changePct) && Math.abs(changePct) >= 20;
}

export function quoteIsStale(
  quotedAtIso: string | null | undefined,
  nowMs: number,
  assetClass: "stock" | "crypto"
): boolean {
  if (!quotedAtIso) return false;
  const at = Date.parse(quotedAtIso);
  if (!Number.isFinite(at)) return true;
  const age = nowMs - at;
  if (age < 0) return true;
  const limit = assetClass === "crypto" ? CRYPTO_QUOTE_MAX_AGE_MS : STOCK_QUOTE_MAX_AGE_MS;
  return age > limit;
}

/**
 * A directional scenario needs a verified tape.
 * A stale quote or an unconfirmed extreme percent does not get a Buy or Sell.
 */
export function directionalSignalAllowed(input: {
  stale: boolean;
  changeWithheld: boolean;
  verifiedHistory: boolean;
}): boolean {
  return input.verifiedHistory && !input.stale && !input.changeWithheld;
}
