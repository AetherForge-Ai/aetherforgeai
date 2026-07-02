import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/session";
import { totalumSdk } from "@/lib/totalum";
import { normalizeTicker, lookupTicker } from "@/lib/market";

const updateSchema = z.object({
  ticker: z.string().min(1).max(12).optional(),
  shares: z.number().positive().optional(),
  purchase_price: z.number().positive().optional(),
  current_price: z.number().positive().optional(),
  company_name: z.string().optional(),
  sector: z.string().optional(),
});

// Verify the holding exists AND belongs to the current user.
async function loadOwnedStock(id: string, userId: string) {
  const res = await totalumSdk.crud.getRecordById("stock", id);
  const record = (res as any)?.data;
  if (!record) return null;
  const ownerId =
    typeof record.user === "object" && record.user !== null ? record.user._id : record.user;
  if (String(ownerId) !== String(userId)) return null;
  return record;
}

// PUT /api/stocks/[id] — edit a holding
export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const owned = await loadOwnedStock(id, user._id);
    if (!owned) {
      return NextResponse.json({ ok: false, error: "Holding not found" }, { status: 404 });
    }

    const body = (await req.json().catch(() => ({}))) as unknown;
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
    }

    const patch: Record<string, unknown> = { ...parsed.data };
    if (parsed.data.ticker) {
      const ticker = normalizeTicker(parsed.data.ticker);
      patch.ticker = ticker;
      const info = lookupTicker(ticker);
      if (info && !parsed.data.company_name) patch.company_name = info.name;
      if (info && !parsed.data.sector) patch.sector = info.sector;
    }

    await totalumSdk.crud.editRecordById("stock", id, patch);
    console.log(`[api/stocks/${id}] PUT updated for user ${user._id}`);

    return NextResponse.json({ ok: true, data: { _id: id, ...patch } });
  } catch (err: any) {
    console.error("[api/stocks/[id]] PUT error:", err);
    return NextResponse.json({ ok: false, error: err?.message || "Failed to update stock" }, { status: 500 });
  }
}

// DELETE /api/stocks/[id] — remove a holding
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const owned = await loadOwnedStock(id, user._id);
    if (!owned) {
      return NextResponse.json({ ok: false, error: "Holding not found" }, { status: 404 });
    }

    await totalumSdk.crud.deleteRecordById("stock", id);
    console.log(`[api/stocks/${id}] DELETE for user ${user._id}`);

    return NextResponse.json({ ok: true, data: { _id: id } });
  } catch (err: any) {
    console.error("[api/stocks/[id]] DELETE error:", err);
    return NextResponse.json({ ok: false, error: err?.message || "Failed to delete stock" }, { status: 500 });
  }
}
