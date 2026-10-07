/**
 * One paper brokerage rule for every asset.
 * 0.50% of the trade value on a buy and on a sell — shares, crypto, DEX tokens, gold and silver.
 * Cash movements suggest a fee of zero. The figure is always shown and can be typed over.
 */

export const PAPER_FEE_RATE = 0.005;

export const PAPER_FEE_SUMMARY =
  "Paper brokerage is 0.50% of the trade value (quantity × price) on every buy and on every sell, for shares, crypto, DEX tokens, gold and silver. It is rounded to the nearest cent in the trade currency. A deposit, withdrawal, dividend, tax line or opening balance suggests a fee of zero. The fee is always shown, including when it is zero, and you can type over it before you confirm.";

const TRADED = new Set(["buy", "sell"]);

export function suggestedFee(type: string, quantity: number, price: number): number {
  if (!TRADED.has(type)) return 0;
  const notional = Math.max(0, Number(quantity) || 0) * Math.max(0, Number(price) || 0);
  if (!(notional > 0)) return 0;
  return Math.round(notional * PAPER_FEE_RATE * 100) / 100;
}
