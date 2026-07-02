import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { totalumSdk } from "@/lib/totalum";
import { simulateTick } from "@/lib/market";

/**
 * POST /api/stocks/refresh
 * Simulates a market tick: applies a bounded random walk to every holding's
 * current price and persists it. Returns the updated holdings.
 */
export async function POST() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const result = await totalumSdk.crud.query("stock", {
      _filter: { user: user._id },
      _limit: 500,
    });
    const stocks = (result?.data as any[]) || [];

    const updates = await Promise.all(
      stocks.map(async (s) => {
        const base = Number(s.current_price) || Number(s.purchase_price) || 0;
        const next = simulateTick(base);
        try {
          await totalumSdk.crud.editRecordById("stock", s._id, { current_price: next });
        } catch (err) {
          console.error(`[api/stocks/refresh] Failed to update ${s._id}:`, err);
          throw err;
        }
        return { ...s, current_price: next };
      })
    );

    console.log(`[api/stocks/refresh] Updated ${updates.length} prices for user ${user._id}`);
    return NextResponse.json({ ok: true, data: updates });
  } catch (err: any) {
    console.error("[api/stocks/refresh] error:", err);
    return NextResponse.json({ ok: false, error: err?.message || "Failed to refresh prices" }, { status: 500 });
  }
}
