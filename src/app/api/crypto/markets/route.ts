/**
 * GET /api/crypto/markets
 * Returns the top-500 crypto universe priced off Swyftx (the user's exchange),
 * sorted by market-cap rank. Powers the Crypto Market modal AND the Projected
 * Performers section — a single shared, server-cached fetch. Falls back to
 * CoinGecko automatically if Swyftx is unreachable.
 */
import { NextResponse } from "next/server";
import { getTop500 } from "@/lib/crypto-source";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const coins = await getTop500();
    return NextResponse.json({ ok: true, data: coins, total: coins.length });
  } catch (err: any) {
    console.error("[api/crypto/markets] error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Failed to load crypto markets" },
      { status: 502 }
    );
  }
}
