import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/session";
import { totalumSdk } from "@/lib/totalum";

const updateSchema = z.object({
  trimPct: z.number().nullable().optional(),
  trimTriggerDipPct: z.number().nullable().optional(),
  hardSellPrice: z.number().nullable().optional(),
  takeProfitMinPct: z.number().nullable().optional(),
  takeProfitMaxPct: z.number().nullable().optional(),
  instructions: z.string().optional(),
  status: z.enum(["active", "triggered", "paused"]).optional(),
});

// Verify the alert exists AND belongs to the current user.
async function loadOwnedAlert(id: string, userId: string) {
  const res = await totalumSdk.crud.getRecordById("price_alert", id);
  const record = (res as any)?.data;
  if (!record) return null;
  const ownerId = typeof record.user === "object" && record.user !== null ? record.user._id : record.user;
  if (String(ownerId) !== String(userId)) return null;
  return record;
}

// PUT /api/alerts/[id] — edit an alert
export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const owned = await loadOwnedAlert(id, user._id);
    if (!owned) return NextResponse.json({ ok: false, error: "Alert not found" }, { status: 404 });

    const parsed = updateSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
    }
    const d = parsed.data;

    const patch: Record<string, unknown> = {};
    if (d.trimPct !== undefined) patch.trim_pct = d.trimPct;
    if (d.trimTriggerDipPct !== undefined) patch.trim_trigger_dip_pct = d.trimTriggerDipPct;
    if (d.hardSellPrice !== undefined) patch.hard_sell_price = d.hardSellPrice;
    if (d.takeProfitMinPct !== undefined) patch.take_profit_min_pct = d.takeProfitMinPct;
    if (d.takeProfitMaxPct !== undefined) patch.take_profit_max_pct = d.takeProfitMaxPct;
    if (d.instructions !== undefined) patch.instructions = d.instructions.trim();
    if (d.status !== undefined) patch.status = d.status;

    await totalumSdk.crud.editRecordById("price_alert", id, patch);
    console.log(`[api/alerts/${id}] PUT updated for user ${user._id}`);
    return NextResponse.json({ ok: true, data: { _id: id, ...patch } });
  } catch (err: any) {
    console.error("[api/alerts/[id]] PUT error:", err);
    return NextResponse.json({ ok: false, error: err?.message || "Failed to update alert" }, { status: 500 });
  }
}

// DELETE /api/alerts/[id] — remove an alert
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const owned = await loadOwnedAlert(id, user._id);
    if (!owned) return NextResponse.json({ ok: false, error: "Alert not found" }, { status: 404 });

    await totalumSdk.crud.deleteRecordById("price_alert", id);
    console.log(`[api/alerts/${id}] DELETE for user ${user._id}`);
    return NextResponse.json({ ok: true, data: { _id: id } });
  } catch (err: any) {
    console.error("[api/alerts/[id]] DELETE error:", err);
    return NextResponse.json({ ok: false, error: err?.message || "Failed to delete alert" }, { status: 500 });
  }
}
