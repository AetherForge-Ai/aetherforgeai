import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { totalumSdk } from "@/lib/totalum";

// Verify the watchlist item exists AND belongs to the current user.
async function loadOwnedItem(id: string, userId: string) {
  const res = await totalumSdk.crud.getRecordById("watchlist", id);
  const record = (res as any)?.data;
  if (!record) return null;
  const ownerId =
    typeof record.user === "object" && record.user !== null ? record.user._id : record.user;
  if (String(ownerId) !== String(userId)) return null;
  return record;
}

// DELETE /api/watchlist/[id] — remove a tracked ticker
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const owned = await loadOwnedItem(id, user._id);
    if (!owned) {
      return NextResponse.json({ ok: false, error: "Watchlist item not found" }, { status: 404 });
    }

    await totalumSdk.crud.deleteRecordById("watchlist", id);
    console.log(`[api/watchlist/${id}] DELETE for user ${user._id}`);
    return NextResponse.json({ ok: true, data: { _id: id } });
  } catch (err: any) {
    console.error("[api/watchlist/[id]] DELETE error:", err);
    return NextResponse.json({ ok: false, error: err?.message || "Failed to remove from watchlist" }, { status: 500 });
  }
}
