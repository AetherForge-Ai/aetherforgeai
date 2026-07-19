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

/**
 * DELETE /api/metals/[id] — SELL a metal holding at today's spot price.
 *
 * Supports partial sales via query param:
 *   DELETE /api/metals/[id]              → sell entire holding
 *   DELETE /api/metals/[id]?ounces=2.5   → sell 2.5 oz only; remainder stays
 *
 * Selling credits cash, books realized P&L against the price paid, and logs the
 * movement in the Transaction Center. If the remaining balance is effectively
 * zero the record is removed; otherwise ounces are reduced in place.
 */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
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
    const heldOunces = Number(owned.ounces) || 0;
    const avgCost = Number(owned.purchase_price_per_oz) || 0;

    if (heldOunces <= 0) {
      return NextResponse.json({ ok: false, error: "No ounces left to sell" }, { status: 400 });
    }

    // Optional partial quantity from ?ounces=
    const url = new URL(req.url);
    const ouncesParam = url.searchParams.get("ounces");
    let sellOunces = heldOunces;
    if (ouncesParam != null && ouncesParam !== "") {
      const requested = Number(ouncesParam);
      if (!isFinite(requested) || requested <= 0) {
        return NextResponse.json({ ok: false, error: "ounces must be a positive number" }, { status: 400 });
      }
      if (requested > heldOunces + 1e-9) {
        return NextResponse.json(
          { ok: false, error: `You only hold ${heldOunces} oz of ${metal}` },
          { status: 400 }
        );
      }
      sellOunces = requested;
    }

    // Resolve today's spot (NZD/oz) as the sale price.
    const spot = await getMetalsSpot();
    const spotNZD = spot[metal]?.nzdPerOz || 0;
    if (!(spotNZD > 0)) {
      return NextResponse.json({ ok: false, error: "Could not resolve live spot price" }, { status: 502 });
    }

    const isPartial = sellOunces < heldOunces - 1e-9;
    const remaining = Math.max(0, heldOunces - sellOunces);

    // Credit cash + log the sell BEFORE mutating the holding, so a failure never
    // changes the record without recording the proceeds.
    const trade = await recordMetalTrade(user, {
      side: "sell",
      metal,
      ounces: sellOunces,
      pricePerOzNZD: spotNZD,
      avgCostNZD: avgCost,
      notes: isPartial ? `Partial sell ${sellOunces} oz at spot` : "Sold at spot",
    });

    if (remaining <= 1e-9) {
      // Fully closed — remove the record.
      await totalumSdk.crud.deleteRecordById("precious_metal", id);
      console.log(
        `[api/metals/${id}] SOLD ALL ${sellOunces}oz ${metal} @ ${spotNZD} NZD for user ${user._id} → cash ${trade.cashBalance}, realized ${trade.realizedNZD}`
      );
    } else {
      // Partial — reduce ounces in place (cost basis per oz stays the same).
      await totalumSdk.crud.editRecordById("precious_metal", id, { ounces: remaining });
      console.log(
        `[api/metals/${id}] PARTIAL SELL ${sellOunces}oz ${metal} @ ${spotNZD} NZD (remaining ${remaining}oz) for user ${user._id} → cash ${trade.cashBalance}, realized ${trade.realizedNZD}`
      );
    }

    const proceeds = Math.abs(trade.transaction?.total ?? sellOunces * spotNZD);

    return NextResponse.json({
      ok: true,
      data: {
        _id: id,
        cashBalance: trade.cashBalance,
        realizedNZD: trade.realizedNZD,
        proceeds,
        pricePerOzNZD: spotNZD,
        soldOunces: sellOunces,
        remainingOunces: remaining <= 1e-9 ? 0 : remaining,
        partial: isPartial,
      },
    });
  } catch (err: any) {
    console.error("[api/metals/[id]] DELETE error:", err);
    return NextResponse.json({ ok: false, error: err?.message || "Failed to sell metal" }, { status: 500 });
  }
}