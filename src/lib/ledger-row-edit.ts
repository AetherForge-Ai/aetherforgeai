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

/** Every booking field of the stored row, so a restore is the same trade. */
export function originalTradeInput(row: Record<string, unknown>) {
  const str = (k: string) => (row[k] != null && row[k] !== "" ? String(row[k]) : undefined);
  const num = (k: string) => (Number(row[k]) > 0 ? Number(row[k]) : undefined);
  return {
    type: String(row.type) as "buy" | "sell",
    ticker: String(row.ticker || ""),
    asset_type: String(row.asset_type || "stock") as "stock" | "crypto" | "metal",
    asset_name: str("asset_name"),
    quantity: Number(row.quantity) || 0,
    price: Number(row.price) || 0,
    fees: Number(row.fees) || 0,
    executed_at: str("executed_at"),
    currency: str("currency"),
    fx_rate: num("fx_rate"),
    notes: str("notes"),
    exchange: str("exchange"),
    execution_status: "filled" as const,
    price_source: (str("price_source") || "user_fill") as never,
    confirm: true,
  };
}

export type TradeEditFields = { quantity?: number; price?: number; fees?: number; executed_at?: string };

export function isTradeLine(line: { type: string }): boolean {
  return line.type === "buy" || line.type === "sell";
}

/** Confirmation text for removing one buy or sell. */
export function tradeDeleteCopy(line: { type: string; ticker: string; quantity: number | null; cashNzd: number }): string {
  const qty = line.quantity == null ? "" : `${line.quantity} `;
  const cash = Math.abs(line.cashNzd).toFixed(2);
  const cashLine =
    line.type === "buy" ? `NZ$${cash} goes back to cash.` : `NZ$${cash} comes out of cash.`;
  return `This removes the ${line.type} of ${qty}${line.ticker}. ${cashLine} The holding and FIFO gains are worked out again. If a later sell needs these units, the removal is refused. Cancel changes nothing.`;
}
