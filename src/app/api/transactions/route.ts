import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/session";
import { applyTransaction, loadLedger } from "@/lib/transactions";

export const dynamic = "force-dynamic";

const tradeSchema = z.object({
  type: z.enum(["buy", "sell", "deposit", "withdraw"]),
  ticker: z.string().max(12).optional(),
  asset_name: z.string().max(120).optional(),
  asset_type: z.enum(["stock", "crypto"]).optional(),
  sector: z.string().max(80).optional(),
  quantity: z.number().positive().optional(),
  price: z.number().positive().optional(),
  fees: z.number().min(0).optional(),
  amount: z.number().positive().optional(),
  notes: z.string().max(500).optional(),
  executed_at: z.string().optional(),
});

// GET /api/transactions — the user's ledger + cash balance + realized P&L rollups
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    const ledger = await loadLedger(user);
    return NextResponse.json({ ok: true, data: ledger });
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
    const user = await getCurrentUser();
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
