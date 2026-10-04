/**
 * GET /api/crypto/dex
 * Top decentralized tokens by 24-hour market volume. Live CoinGecko prices only.
 */
import { NextResponse } from "next/server";
import { fetchDexTop400 } from "@/lib/crypto-coingecko";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const page = await fetchDexTop400();
    return NextResponse.json({
      ok: true,
      data: page.rows,
      total: page.rows.length,
      notice: page.notice,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Live decentralized-token prices are unavailable.";
    console.error("[api/crypto/dex] error:", err);
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
