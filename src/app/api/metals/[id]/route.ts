import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser, isStripeConfigured, hasPaidSubscription, type AppUser } from "@/lib/session";
import { totalumSdk } from "@/lib/totalum";
import { getMetalsSpot, type MetalKey } from "@/lib/metals";
import { recordMetalTrade } from "@/lib/transactions";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  ounces: z.number().positive().optional(),
  purchase_price_per_oz: z.number().positive().optional(),
});

function isEntitled(user: AppUser | null): boolean {
  if (!user) return false;
  if (!isStripeConfigured()) return true; // demo mode
  return hasPaidSubscription(user);
}

// Verify the metal holding exists AND belongs to the current user.
async function loadOwnedMetal(id: string, userId: string) {
  const res = await totalumSdk.crud.getRecordById("precious_metal", id);
  const record = (res as any)?.data;
  if (!record) return null;
  const ownerId =
    typeof record.user === "object" && record.user !== null ? record.user._id : record.user;
  if (String(ownerId) !== String(userId)) return null;
  return record;
}

// PUT /api/metals/[id] — edit a metal holding
export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    if (!isEntitled(user)) {
      return NextResponse.json({ ok: false, error: "Not entitled" }, { status: 403 });
    }

    const owned = await loadOwnedMetal(id, user._id);
    if (!owned) return NextResponse.json({ ok: false, error: "Holding not found" }, { status: 404 });

    const body = (await req.json().catch(() => ({}))) as unknown;
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
    }

    await totalumSdk.crud.editRecordById("precious_metal", id, { ...parsed.data });
    console.log(`[api/metals/${id}] PUT updated for user ${user._id}`);

    return NextResponse.json({ ok: true, data: { _id: id, ...parsed.data } });
  } catch (err: any) {
    console.error("[api/metals/[id]] PUT error:", err);
    return NextResponse.json({ ok: false, error: err?.message || "Failed to update metal" }, { status: 500 });
  }
}

// DELETE /api/metals/[id] — SELL a metal holding at today's spot price.
// Selling credits cash, books realized P&L against the price paid, logs the
// movement in the Transaction Center, then removes the (now-closed) holding.
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    if (!isEntitled(user)) {
      return NextResponse.json({ ok: false, error: "Not entitled" }, { status: 403 });
    }

    const owned = await loadOwnedMetal(id, user._id);
    if (!owned) return NextResponse.json({ ok: false, error: "Holding not found" }, { status: 404 });

    const metal = owned.metal as MetalKey;
    const ounces = Number(owned.ounces) || 0;
    const avgCost = Number(owned.purchase_price_per_oz) || 0;

    // Resolve today's spot (NZD/oz) as the sale price.
    const spot = await getMetalsSpot();
    const spotNZD = spot[metal]?.nzdPerOz || 0;

    // Credit cash + log the sell BEFORE removing the holding, so a failure never
    // deletes the record without recording the proceeds.
    const trade = await recordMetalTrade(user, {
      side: "sell",
      metal,
      ounces,
      pricePerOzNZD: spotNZD,
      avgCostNZD: avgCost,
      notes: "Sold at spot",
    });

    await totalumSdk.crud.deleteRecordById("precious_metal", id);
    console.log(
      `[api/metals/${id}] SOLD ${ounces}oz ${metal} @ ${spotNZD} NZD for user ${user._id} → cash ${trade.cashBalance}, realized ${trade.realizedNZD}`
    );

    return NextResponse.json({
      ok: true,
      data: {
        _id: id,
        cashBalance: trade.cashBalance,
        realizedNZD: trade.realizedNZD,
        proceeds: Math.abs(trade.transaction?.total ?? ounces * spotNZD),
        pricePerOzNZD: spotNZD,
      },
    });
  } catch (err: any) {
    console.error("[api/metals/[id]] DELETE error:", err);
    return NextResponse.json({ ok: false, error: err?.message || "Failed to sell metal" }, { status: 500 });
  }
}
