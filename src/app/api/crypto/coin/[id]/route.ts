/**
 * GET /api/crypto/coin/[id]
 * Rich single-coin metadata for the Coin Detail modal.
 */
import { NextResponse } from "next/server";
import { fetchCoinDetail } from "@/lib/crypto-coingecko";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const detail = await fetchCoinDetail(id);
    return NextResponse.json({ ok: true, data: detail });
  } catch (err: any) {
    console.error(`[api/crypto/coin/${id}] error:`, err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Failed to load coin" },
      { status: 502 }
    );
  }
}
