/** Ignore Confirm clicks that arrive in the same gesture as Review. */
export const TRADE_REVIEW_ARM_MS = 400;

export const TRADE_CONFIRM_REQUIRED = "Confirm this trade before it is recorded.";

export function reviewClickIsArmed(armedAt: number, now = Date.now()): boolean {
  return armedAt > 0 && now - armedAt >= TRADE_REVIEW_ARM_MS;
}
