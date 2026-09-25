import { NextResponse } from "next/server";
import { z } from "zod";
import { getStableSessionUser, getTradeSessionUser } from "@/lib/session";
import { applyTransaction, loadLedger } from "@/lib/transactions";
import { hasForeignOwner, requestClaimsOtherUser } from "@/lib/account-guard";
import { accountMismatchResponse, privateJson } from "@/lib/account-response";
import { TRADE_CONFIRM_REQUIRED } from "@/lib/trade-confirm";

export const dynamic = "force-dynamic";

const tradeSchema = z.object({
  type: z.enum(["buy", "sell", "deposit", "withdraw"]),
  ticker: z.string().max(12).optional(),
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
  /** Required for buy and sell. Deposit and withdraw ignore it. */
  confirm: z.boolean().optional(),
});

// GET /api/transactions — the user's ledger + cash balance + realized P&L rollups
export async function GET(req: Request) {
  try {
    const user = await getStableSessionUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    // UI account (x-af-user-id) or a user-record id that isn't this session
    // means the body would be someone else's cash. Refuse it outright.
    if (user.identityConflict || requestClaimsOtherUser(req, user._id)) {
      console.error("[api/transactions] Refusing cross-account ledger", {
        sessionUserId: user._id,
        claimed: req.headers.get("x-af-user-id"),
        identityConflict: user.identityConflict,
      });
      return accountMismatchResponse(user._id);
    }
    const ledger = await loadLedger(user);
    if (hasForeignOwner(ledger.transactions, user._id)) {
      console.error("[api/transactions] Refusing ledger rows owned by another user", {
        sessionUserId: user._id,
      });
      return accountMismatchResponse(user._id);
    }
    // Echo userId on the envelope AND inside data so clients can reject a
    // stale/cross-user body even if one of the two is stripped by a cache.
    return privateJson({
      ok: true,
      userId: user._id,
      data: { ...ledger, userId: user._id },
    });
  } catch (err: any) {
    console.error("[api/transactions] GET error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Failed to load transactions" },
      { status: 500 }
    );
  }
}

// POST /api/transactions — record a buy / sell / deposit / withdraw
export async function POST(req: Request) {
  try {
    const user = await getTradeSessionUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as unknown;
    const parsed = tradeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
    }

    const input = parsed.data;

    // Per-type required-field guards (clear errors instead of silent NaNs).
    if (input.type === "buy" || input.type === "sell") {
      if (input.confirm !== true) {
        return NextResponse.json({ ok: false, error: TRADE_CONFIRM_REQUIRED }, { status: 400 });
      }
      if (!input.ticker) {
        return NextResponse.json({ ok: false, error: "Ticker is required" }, { status: 400 });
      }
      if (!input.quantity || !input.price) {
        return NextResponse.json(
          { ok: false, error: "Quantity and price are required" },
          { status: 400 }
        );
      }
    } else if (!input.amount) {
      return NextResponse.json({ ok: false, error: "Amount is required" }, { status: 400 });
    }

    const result = await applyTransaction(user, input);
    // Re-read the ledger so the client gets fresh rollups in one round-trip.
    const ledger = await loadLedger({ ...user, cash_balance: result.cashBalance });

    console.log(
      `[api/transactions] ${input.type} recorded for user ${user._id} — cash ${result.cashBalance}, realized ${result.realizedNZD}`
    );

    return NextResponse.json({
      ok: true,
      data: { ...ledger, lastTransaction: result.transaction, realizedNZD: result.realizedNZD },
    });
  } catch (err: any) {
    console.error("[api/transactions] POST error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Failed to record transaction" },
      { status: 400 }
    );
  }
}
