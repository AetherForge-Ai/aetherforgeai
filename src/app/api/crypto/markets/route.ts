/**
 * GET /api/crypto/markets
 * Top 400 by market cap. CoinGecko, then the existing Swyftx / Yahoo sweep.
 * Always JSON. A failed source is a plain sentence, never an HTTP 502
 * (Cloudflare replaces that body with text).
 */
import { NextResponse } from "next/server";
import { marketsBody } from "@/lib/crypto-api-body";
import { loadTop400Markets } from "@/lib/crypto-source";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const page = await loadTop400Markets();
    return NextResponse.json(marketsBody(page.coins, page.notice), {
      headers: { "cache-control": "no-store" },
    });
  } catch (err: unknown) {
    console.error("[api/crypto/markets] error:", err);
    return NextResponse.json(marketsBody(null, null), {
      headers: { "cache-control": "no-store" },
    });
  }
}
