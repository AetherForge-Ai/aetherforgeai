/**
 * Cash movement for a filled paper buy or sell.
 * The transaction engine uses this for the ledger. It is not a second book.
 * A missing live price is refused and is not replaced.
 */

import {
  BASELINE_FX_TO_NZD,
  formatQuantity,
  nzdAtBookRate,
  roundMoney,
  type CurrencyCode,
  type FxRatesToNZD,
} from "@/lib/currency";

function round(n: number, decimals = 2): number {
  const f = 10 ** decimals;
  return Math.round((n + Number.EPSILON) * f) / f;
}

export interface PaperCashMove {
  side: "buy" | "sell";
  quantity: number;
  /** Live price per unit in the trade currency. Null when the print is missing. */
  price: number | null;
  fees?: number;
  currency: CurrencyCode;
  rates?: FxRatesToNZD;
  cashNZD: number;
  shares: number;
}

export interface PaperCashResult {
  ok: boolean;
  error?: string;
  cashNZD: number;
  shares: number;
  /** Signed NZD cash change. A buy is negative. */
  cashDeltaNZD: number;
}

/** Debit cash on a buy and credit it on a sell. Shares move with the fill. */
export function applyPaperCashMove(input: PaperCashMove): PaperCashResult {
  const quantity = Number(input.quantity);
  const price = input.price;
  const fees = Math.max(0, Number(input.fees) || 0);
  const shares = Number(input.shares) || 0;
  const cashNZD = Number(input.cashNZD) || 0;
  const unchanged = { ok: false as const, cashNZD, shares, cashDeltaNZD: 0 };
  if (!(quantity > 0)) return { ...unchanged, error: "Quantity must be greater than 0" };
  if (!(price != null && price > 0)) return { ...unchanged, error: "live price unavailable" };
  const rates = input.rates ?? BASELINE_FX_TO_NZD;
  if (input.side === "sell") {
    if (quantity > shares + 1e-6) {
      return { ...unchanged, error: `You only hold ${formatQuantity(shares)}` };
    }
    const proceedsNZD = roundMoney(nzdAtBookRate(quantity * price - fees, input.currency, rates));
    const left = round(shares - quantity, 6);
    return {
      ok: true,
      cashNZD: round(cashNZD + proceedsNZD),
      shares: left <= 1e-9 ? 0 : left,
      cashDeltaNZD: proceedsNZD,
    };
  }
  const costNZD = roundMoney(nzdAtBookRate(quantity * price + fees, input.currency, rates));
  return {
    ok: true,
    cashNZD: round(cashNZD - costNZD),
    shares: round(shares + quantity, 6),
    cashDeltaNZD: round(-costNZD),
  };
}
