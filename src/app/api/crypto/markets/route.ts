/**
 * GET /api/crypto/markets
 * Returns the full top-500 CoinGecko universe (2 pages merged + deduped, sorted
 * by market-cap rank). Powers the Crypto Market modal AND the Projected
 * Performers section — a single shared, server-cached fetch.
 */
import { NextResponse } from "next/server";
import { fetchTop500 } from "@/lib/crypto-coingecko";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const coins = await fetchTop500();
    return NextResponse.json({ ok: true, data: coins, total: coins.length });
  } catch (err: any) {
    console.error("[api/crypto/markets] error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Failed to load crypto markets" },
      { status: 502 }
    );
  }
}
