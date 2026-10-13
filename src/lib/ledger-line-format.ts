import { formatQuantity, formatUnitPrice, type CurrencyCode } from "@/lib/currency";
import { MISSING_MARK } from "@/lib/portfolio-snapshot";

const CODES = new Set<CurrencyCode>(["NZD", "USD", "AUD"]);

export function formatLedgerQtyPrice(input: {
  quantity: number | null;
  price: number | null;
  currency: string | null;
}): { text: string; reason: string | null } {
  const qty =
    input.quantity != null && Number.isFinite(input.quantity) ? formatQuantity(input.quantity) : null;
  const code = String(input.currency || "").toUpperCase();
  const known = CODES.has(code as CurrencyCode) ? (code as CurrencyCode) : null;
  if (input.price == null || !Number.isFinite(input.price)) {
    return {
      text: `${qty ?? MISSING_MARK} × ${MISSING_MARK}`,
      reason: "No price was stored on this line.",
    };
  }
  if (!known) {
    return {
      text: `${qty ?? MISSING_MARK} × ${MISSING_MARK}`,
      reason: "Currency was not stored on this line.",
    };
  }
  return {
    text: `${qty ?? MISSING_MARK} × ${formatUnitPrice(input.price, known)}`,
    reason: qty == null ? "No quantity was stored on this line." : null,
  };
}
