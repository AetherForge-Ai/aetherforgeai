/**
 * GET /api/crypto/markets
 * CoinGecko top 400 by market cap, with a blockchain label.
 * A missing page is said. Prices are not invented.
 */
import { NextResponse } from "next/server";
import { fetchTop400 } from "@/lib/crypto-coingecko";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const page = await fetchTop400();
    return NextResponse.json({
      ok: true,
      data: page.coins,
      total: page.coins.length,
      notice: page.notice,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Live crypto prices are unavailable.";
    console.error("[api/crypto/markets] error:", err);
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
