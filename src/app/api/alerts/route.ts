import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/session";
import { totalumSdk } from "@/lib/totalum";
import { referencePrice } from "@/lib/market";

const createSchema = z.object({
  stockId: z.string().optional(),
  ticker: z.string().min(1).max(12),
  trimPct: z.number().nullable().optional(),
  trimTriggerDipPct: z.number().nullable().optional(),
  hardSellPrice: z.number().nullable().optional(),
  takeProfitMinPct: z.number().nullable().optional(),
  takeProfitMaxPct: z.number().nullable().optional(),
  instructions: z.string().optional(),
  status: z.enum(["active", "triggered", "paused"]).optional(),
});

/** GET /api/alerts — list the current user's price alerts (with live prices). */
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const res = await totalumSdk.crud.query("price_alert", {
      _filter: { user: user._id },
      _sort: { createdAt: "desc" },
      _limit: 200,
    });
    const rows = (res?.data as any[]) || [];
    const alerts = rows.map((a) => {
      const currentPrice = referencePrice(a.ticker, Number(a.hard_sell_price) || 1);
      const triggered =
        typeof a.hard_sell_price === "number" && a.hard_sell_price > 0 && currentPrice <= a.hard_sell_price;
      return {
        _id: a._id,
        ticker: a.ticker,
        stockId: typeof a.stock === "string" ? a.stock : a.stock?._id ?? null,
        trimPct: a.trim_pct ?? null,
        trimTriggerDipPct: a.trim_trigger_dip_pct ?? null,
        hardSellPrice: a.hard_sell_price ?? null,
        takeProfitMinPct: a.take_profit_min_pct ?? null,
        takeProfitMaxPct: a.take_profit_max_pct ?? null,
        instructions: a.instructions ?? "",
        status: a.status ?? "active",
        currentPrice,
        triggered,
      };
    });

    console.log(`[api/alerts] GET returned ${alerts.length} alerts for user ${user._id}`);
    return NextResponse.json({ ok: true, data: alerts });
  } catch (err: any) {
    console.error("[api/alerts] GET error:", err);
    return NextResponse.json({ ok: false, error: err?.message || "Failed to load alerts" }, { status: 500 });
  }
}

/** POST /api/alerts — create a price alert for a holding. */
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
    }
    const d = parsed.data;

    const record: Record<string, unknown> = {
      user: user._id,
      ticker: d.ticker.trim().toUpperCase(),
      trim_pct: d.trimPct ?? null,
      trim_trigger_dip_pct: d.trimTriggerDipPct ?? null,
      hard_sell_price: d.hardSellPrice ?? null,
      take_profit_min_pct: d.takeProfitMinPct ?? null,
      take_profit_max_pct: d.takeProfitMaxPct ?? null,
      instructions: d.instructions?.trim() || "",
      status: d.status || "active",
    };
    if (d.stockId) record.stock = d.stockId;

    const saved = await totalumSdk.crud.createRecord("price_alert", record);
    console.log(`[api/alerts] Created alert for ${record.ticker} (user ${user._id})`);
    return NextResponse.json({ ok: true, data: saved?.data ?? record });
  } catch (err: any) {
    console.error("[api/alerts] POST error:", err);
    return NextResponse.json({ ok: false, error: err?.message || "Failed to create alert" }, { status: 500 });
  }
}
