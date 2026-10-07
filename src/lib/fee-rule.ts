/**
 * The fee is whatever you enter.
 * It defaults to zero on every transaction type and every asset.
 * Nothing here adds a percentage. The figure is always shown and can be typed over.
 */

export const PAPER_FEE_SUMMARY =
  "The fee is whatever you enter. It defaults to NZ$0.00 on every transaction type and every asset — shares, crypto, DEX tokens, gold and silver — the same way a portfolio tracker leaves brokerage at zero until you type the fee your broker charged. The fee is always shown, including at zero. That amount is what the review screen, the cash change, cash after, and the ledger use.";

/** Default fee for a movement. Always zero; a typed fee replaces it. */
export function suggestedFee(_type: string, _quantity: number, _price: number): number {
  return 0;
}
