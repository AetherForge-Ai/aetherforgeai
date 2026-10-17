import { NextResponse } from "next/server";
import { getTradeSessionUser } from "@/lib/session";
import { applyTransaction } from "@/lib/transactions";
import { invalidateBookCache } from "@/lib/book-cache";
import { totalumSdk } from "@/lib/totalum";
import { holdingAfterSplit, splitInputError, splitNote } from "@/lib/stock-split";

export const dynamic = "force-dynamic";

/**
 * Goal b9 H-9: POST { ticker, asset_type, ratio, date } records an N:1 split
 * on a holding the signed-in member owns. Stored as a correction row tagged
 * [SPLIT:…]; no cash moves, NZ$ cost is unchanged.
 */
export async function POST(req: Request) {
  try {
    const user = await getTradeSessionUser();
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    const body = (await req.json().catch(() => ({}))) as { ticker?: string; asset_type?: string; ratio?: number; date?: string };
    const ticker = String(body.ticker || "").trim().toUpperCase();
    const assetType = body.asset_type === "crypto" ? "crypto" : "stock";
    const res = await totalumSdk.crud.query("stock", { _filter: { user: user._id }, _limit: 1000 });
    const rows = (res?.data as unknown as Array<{ _id: string; ticker?: string; asset_type?: string; shares?: number; purchase_price?: number }>) || [];
    const holding = rows.find(
      (r) => String(r.ticker || "").toUpperCase() === ticker && (r.asset_type || "stock") === assetType
    );
    const ratio = Number(body.ratio);
    const error = splitInputError({ ticker, ratio, date: body.date, sharesHeld: Number(holding?.shares) || 0 });
    if (error || !holding) return NextResponse.json({ ok: false, error: error || "Holding not found" }, { status: 400 });
    const after = holdingAfterSplit(Number(holding.shares) || 0, Number(holding.purchase_price) || 0, ratio);
    const result = await applyTransaction(
      user,
      {
        type: "correction",
        ticker,
        asset_type: assetType,
        quantity: after.shares,
        price: after.averageCost > 0 ? after.averageCost : 0.000001,
        notes: splitNote(ratio, String(body.date)),
        executed_at: `${body.date}T00:00:00+13:00`,
        trade_date: body.date,
      } as never,
      { fromHoldingEdit: true }
    );
    invalidateBookCache(user._id);
    return NextResponse.json({ ok: true, holding: after, holdingId: result.holdingId ?? holding._id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "The split was not saved";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
