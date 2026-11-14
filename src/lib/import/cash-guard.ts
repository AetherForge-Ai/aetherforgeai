/** Shown on the import preview when a row would take paper cash below zero. */
export const PREVIEW_CASH_BELOW_ZERO = "This would take cash below zero.";

/** Non-blocking note when a broker file would leave paper cash negative. The file is still saved. */
export function importCashWarning(openingCashNzd: number, cashEffectNzd: number): string | null {
  const after = Math.round(((Number(openingCashNzd) || 0) + (Number(cashEffectNzd) || 0)) * 100) / 100;
  if (after >= -0.001) return null;
  return `Your cash will be NZ$${after.toFixed(2)} after this import. Add a deposit if that's not right.`;
}

/**
 * Walk the rows in file order against the cash already on the book.
 * A reduction that lands below zero is the same refusal confirm would hit, shown first.
 */
export function previewCashRefusal(rows: readonly { cashEffectNzd: number }[], openingCashNzd: number): string | null {
  let cash = Math.round((Number(openingCashNzd) || 0) * 100) / 100;
  for (const row of rows) {
    const delta = Number(row.cashEffectNzd) || 0;
    const next = Math.round((cash + delta) * 100) / 100;
    if (delta < -0.001 && next < -0.001) return PREVIEW_CASH_BELOW_ZERO;
    cash = next;
  }
  return null;
}
