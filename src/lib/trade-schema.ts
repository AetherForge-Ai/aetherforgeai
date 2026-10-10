import { z } from "zod";

/**
 * Body for POST /api/transactions.
 * Lives beside the route because a route module cannot export extra values.
 * DEX venue and chain are accepted here and stored in existing columns.
 */
export const tradeSchema = z.object({
  type: z.enum(["buy", "sell", "deposit", "withdraw", "dividend", "tax", "opening_balance", "correction"]),
  ticker: z.string().max(32).optional(),
  coingecko_id: z.string().max(80).optional(),
  asset_name: z.string().max(120).optional(),
  asset_type: z.enum(["stock", "crypto", "metal"]).optional(),
  sector: z.string().max(80).optional(),
  quantity: z.number().positive().optional(),
  price: z.number().positive().optional(),
  fees: z.number().min(0).optional(),
  amount: z.number().positive().optional(),
  notes: z.string().max(2000).optional(),
  executed_at: z.string().optional(),
  execution_status: z.enum(["idea", "paper", "filled"]).optional(),
  price_source: z.enum(["user_fill", "broker_import", "session_close", "live_quote", "bot_signal"]).optional(),
  signal_price: z.number().optional(),
  mark_price: z.number().optional(),
  cash_or_notional: z.number().optional(),
  notional_native: z.number().optional(),
  cash_nzd: z.number().optional(),
  soft_override_confirmed: z.boolean().optional(),
  typed_live_override: z.string().optional(),
  broker: z.string().max(80).optional(),
  prior_close: z.number().optional(),
  session_close_date: z.string().optional(),
  trade_date: z.string().optional(),
  order_sizing: z.enum(["units", "notional"]).optional(),
  fx_rate: z.number().optional(),
  fx_source: z.string().optional(),
  /** Required for buy and sell. Cash lines ignore it. */
  confirm: z.boolean().optional(),
  /** DEX fills only. Stored in stock.sector and a notes prefix, not a venue column. */
  venue: z.literal("DEX").optional(),
  /** Readable chain, such as Ethereum. Stored inside the sector tag and the notes prefix. */
  chain: z.string().max(80).optional(),
});
