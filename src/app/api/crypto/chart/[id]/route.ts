/**
 * GET /api/crypto/chart/[id]?days=7
 * Price/volume series for the Coin Detail interactive chart.
 */
import { NextResponse } from "next/server";
import { getCoinChart } from "@/lib/crypto-source";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const days = new URL(req.url).searchParams.get("days") || "7";
  try {
    const chart = await getCoinChart(id, days);
    return NextResponse.json({ ok: true, data: chart });
  } catch (err: any) {
    console.error(`[api/crypto/chart/${id}] error:`, err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Failed to load chart" },
      { status: 502 }
    );
  }
}
