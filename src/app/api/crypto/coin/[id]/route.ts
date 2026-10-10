/**
 * GET /api/crypto/coin/[id]
 * Rich single-coin metadata for the Coin Detail modal.
 */
import { NextResponse } from "next/server";
import { getCoinDetail } from "@/lib/crypto-source";
import { PUBLIC_PRICE_QUIET, publicCoinDescription, publicCoinSourceLine } from "@/lib/data-sources";
import { publicSourceAllowed } from "@/lib/swyftx-display";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const detail = await getCoinDetail(id);
    const source = publicSourceAllowed(detail.source) ? detail.source : undefined;
    return NextResponse.json({
      ok: true,
      data: {
        ...detail,
        source,
        sourceLine: publicCoinSourceLine(source),
        description: publicCoinDescription(detail.description),
      },
    });
  } catch (err: unknown) {
    console.error(`[api/crypto/coin/${id}] error:`, err);
    return NextResponse.json(
      { ok: false, error: PUBLIC_PRICE_QUIET },
      { headers: { "cache-control": "no-store" } }
    );
  }
}
