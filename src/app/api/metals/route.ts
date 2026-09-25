import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser, getTradeSessionUser, isStripeConfigured, hasPaidSubscription, type AppUser } from "@/lib/session";
import { hasForeignOwner, requestClaimsOtherUser } from "@/lib/account-guard";
import { accountMismatchResponse, privateJson } from "@/lib/account-response";
import { totalumSdk } from "@/lib/totalum";
import { getMetalsSpot } from "@/lib/metals";
import { recordMetalTrade } from "@/lib/transactions";
import { TRADE_CONFIRM_REQUIRED } from "@/lib/trade-confirm";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  metal: z.enum(["gold", "silver"]),
  ounces: z.number().positive("Ounces must be greater than 0"),
  purchase_price_per_oz: z.number().positive("Purchase price must be greater than 0"),
  confirm: z.boolean().optional(),
});

/**
 * Precious metals is a BONUS feature, free for any PAYING subscriber and active
 * only while their membership is active. In demo mode (no Stripe key) we open it
 * up so testers aren't locked out — mirrors the dashboard's soft gate.
 */
function isEntitled(user: AppUser | null): boolean {
  if (!user) return false;
  if (!isStripeConfigured()) return true; // demo mode
  return hasPaidSubscription(user);
}

// GET /api/metals — list the user's metals + current spot prices
export async function GET(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    if (user.identityConflict || requestClaimsOtherUser(req, user._id)) {
      return accountMismatchResponse(user._id);
    }

    if (!isEntitled(user)) {
      console.log(`[api/metals] GET blocked — user ${user._id} lacks an active paid membership`);
      return NextResponse.json(
        { ok: false, error: "Precious metals is a bonus for active paying members.", data: { code: "not_entitled" } },
        { status: 403 }
      );
    }

    const [result, spot] = await Promise.all([
      totalumSdk.crud.query("precious_metal", {
        _filter: { user: user._id },
        _sort: { createdAt: "desc" },
        _limit: 200,
      }),
      getMetalsSpot(),
    ]);

    const metals = (result?.data as any[]) || [];
    if (hasForeignOwner(metals, user._id)) {
      console.error("[api/metals] Refusing metals owned by another user", { sessionUserId: user._id });
      return accountMismatchResponse(user._id);
    }
    console.log(`[api/metals] GET returned ${metals.length} metal holdings for user ${user._id}`);

    return privateJson({ ok: true, userId: user._id, data: { metals, spot } });
  } catch (err: any) {
    console.error("[api/metals] GET error:", err);
    return NextResponse.json({ ok: false, error: err?.message || "Failed to load metals" }, { status: 500 });
  }
}

// POST /api/metals — add a gold/silver holding
export async function POST(req: Request) {
  try {
    const user = await getTradeSessionUser();
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    if (!isEntitled(user)) {
      return NextResponse.json(
        { ok: false, error: "Precious metals is a bonus for active paying members.", data: { code: "not_entitled" } },
        { status: 403 }
      );
    }

    const body = (await req.json().catch(() => ({}))) as unknown;
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
    }
    if (parsed.data.confirm !== true) {
      return NextResponse.json({ ok: false, error: TRADE_CONFIRM_REQUIRED }, { status: 400 });
    }

    const record = {
      metal: parsed.data.metal,
      ounces: parsed.data.ounces,
      purchase_price_per_oz: parsed.data.purchase_price_per_oz,
      user: user._id,
    };

    const result = await totalumSdk.crud.createRecord("precious_metal", record);
    const createdId = (result?.data as { _id?: string } | undefined)?._id;
    console.log(`[api/metals] POST created ${parsed.data.metal} holding for user ${user._id}`);

    // Buying metal debits cash and logs the movement in the Transaction Center,
    // exactly like a share/crypto purchase. Metals are priced in NZD/oz.
    // If the ledger write fails, remove the holding so the two cannot diverge.
    let trade;
    try {
      trade = await recordMetalTrade(user, {
        side: "buy",
        metal: parsed.data.metal,
        ounces: parsed.data.ounces,
        pricePerOzNZD: parsed.data.purchase_price_per_oz,
      });
    } catch (err) {
      if (createdId) {
        await totalumSdk.crud.deleteRecordById("precious_metal", createdId).catch((rollbackErr) => {
          console.error("[api/metals] Failed to remove holding after a rolled-back buy:", rollbackErr);
        });
      }
      throw err;
    }

    return NextResponse.json({
      ok: true,
      data: { metal: result?.data ?? record, cashBalance: trade.cashBalance, transaction: trade.transaction },
    });
  } catch (err: any) {
    console.error("[api/metals] POST error:", err);
    return NextResponse.json({ ok: false, error: err?.message || "Failed to add metal" }, { status: 500 });
  }
}
