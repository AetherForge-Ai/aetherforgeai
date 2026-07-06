import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser, isStripeConfigured, hasPaidSubscription, type AppUser } from "@/lib/session";
import { totalumSdk } from "@/lib/totalum";
import { getMetalsSpot } from "@/lib/metals";
import { recordMetalTrade } from "@/lib/transactions";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  metal: z.enum(["gold", "silver"]),
  ounces: z.number().positive("Ounces must be greater than 0"),
  purchase_price_per_oz: z.number().positive("Purchase price must be greater than 0"),
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
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

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
    console.log(`[api/metals] GET returned ${metals.length} metal holdings for user ${user._id}`);

    return NextResponse.json({ ok: true, data: { metals, spot } });
  } catch (err: any) {
    console.error("[api/metals] GET error:", err);
    return NextResponse.json({ ok: false, error: err?.message || "Failed to load metals" }, { status: 500 });
  }
}

// POST /api/metals — add a gold/silver holding
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
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

    const record = {
      metal: parsed.data.metal,
      ounces: parsed.data.ounces,
      purchase_price_per_oz: parsed.data.purchase_price_per_oz,
      user: user._id,
    };

    const result = await totalumSdk.crud.createRecord("precious_metal", record);
    console.log(`[api/metals] POST created ${parsed.data.metal} holding for user ${user._id}`);

    // Buying metal debits cash and logs the movement in the Transaction Center,
    // exactly like a share/crypto purchase. Metals are priced in NZD/oz.
    const trade = await recordMetalTrade(user, {
      side: "buy",
      metal: parsed.data.metal,
      ounces: parsed.data.ounces,
      pricePerOzNZD: parsed.data.purchase_price_per_oz,
    });

    return NextResponse.json({
      ok: true,
      data: { metal: result?.data ?? record, cashBalance: trade.cashBalance, transaction: trade.transaction },
    });
  } catch (err: any) {
    console.error("[api/metals] POST error:", err);
    return NextResponse.json({ ok: false, error: err?.message || "Failed to add metal" }, { status: 500 });
  }
}
