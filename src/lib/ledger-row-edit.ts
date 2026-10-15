/**
 * BL-7: validate an edit to one buy or sell row. Pure, so it is unit-tested.
 * Only quantity, price, fees and the trade time can change; ticker, side and
 * currency stay as booked (to change those, delete the row and record a new one).
 */
export interface TradeRowFields {
  quantity?: number;
  price?: number;
  fees?: number;
  executed_at?: string;
}

export function editedTradeRow(
  row: { quantity?: number | null; price?: number | null; fees?: number | null; executed_at?: string | null },
  body: Record<string, unknown>
): { row: Required<Pick<TradeRowFields, "quantity" | "price" | "fees">> & { executed_at?: string } } | { error: string } {
  const num = (v: unknown, fallback: number) => (v === undefined || v === null || v === "" ? fallback : Number(v));
  const quantity = num(body.quantity, Number(row.quantity) || 0);
  const price = num(body.price, Number(row.price) || 0);
  const fees = num(body.fees, Number(row.fees) || 0);
  if (!(Number.isFinite(quantity) && quantity > 0)) return { error: "Quantity must be greater than 0." };
  if (!(Number.isFinite(price) && price > 0)) return { error: "Price must be greater than 0." };
  if (!(Number.isFinite(fees) && fees >= 0)) return { error: "Fees cannot be negative." };
  let executed_at = row.executed_at ? String(row.executed_at) : undefined;
  if (body.executed_at !== undefined) {
    const d = new Date(String(body.executed_at));
    if (Number.isNaN(d.getTime())) return { error: "Enter a valid trade date." };
    if (d.getTime() > Date.now() + 60_000) return { error: "The trade date cannot be in the future." };
    executed_at = d.toISOString();
  }
  return { row: { quantity, price, fees, ...(executed_at ? { executed_at } : {}) } };
}
