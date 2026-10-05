/**
 * GET /api/crypto/coin/[id]
 * Rich single-coin metadata for the Coin Detail modal.
 */
import { NextResponse } from "next/server";
import { getCoinDetail } from "@/lib/crypto-source";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const detail = await getCoinDetail(id);
    return NextResponse.json({ ok: true, data: detail });
  } catch (err: unknown) {
    console.error(`[api/crypto/coin/${id}] error:`, err);
    return NextResponse.json(
      { ok: false, error: "Live data for this coin is unavailable right now." },
      { headers: { "cache-control": "no-store" } }
    );
  }
}
