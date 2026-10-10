/**
 * GET /api/crypto/markets
 * Top 400 by market cap. CoinGecko first. Swyftx fills only when SWYFTX_PUBLIC_DISPLAY is on. Yahoo majors are last.
 * Always JSON. A failed source is a plain sentence, never an HTTP 502
 * (Cloudflare replaces that body with text).
 */
import { NextResponse } from "next/server";
import { marketsBody } from "@/lib/crypto-api-body";
import { loadTop400Markets } from "@/lib/crypto-source";

export const dynamic = "force-dynamic";

/** Fresh for 30s, then stale-while-revalidate so a tab reload does not wait on CoinGecko. */
const CACHE_CONTROL = "public, max-age=30, stale-while-revalidate=300";

export async function GET() {
  try {
    const page = await loadTop400Markets();
    return NextResponse.json(marketsBody(page.coins, page.notice), {
      headers: { "cache-control": CACHE_CONTROL },
    });
  } catch (err: unknown) {
    console.error("[api/crypto/markets] error:", err);
    return NextResponse.json(marketsBody(null, null), {
      headers: { "cache-control": "no-store" },
    });
  }
}
