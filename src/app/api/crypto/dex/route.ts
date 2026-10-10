/**
 * GET /api/crypto/dex
 * Returns the DEX rows collected inside the cold-tab budget, or the cached list.
 * Cache-Control uses s-maxage and stale-while-revalidate so the CDN keeps that list.
 * Always JSON. A source that is fully down is a plain sentence, never an HTTP 502.
 */
import { NextResponse } from "next/server";
import { dexBody } from "@/lib/crypto-api-body";
import { fetchDexTop400 } from "@/lib/crypto-coingecko";
import { dexResponseCacheControl } from "@/lib/crypto-dex";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const page = await fetchDexTop400();
    return NextResponse.json(dexBody(page.rows, { collecting: !page.sourceDown, notice: page.notice }), {
      headers: { "cache-control": dexResponseCacheControl(page.rows.length) },
    });
  } catch (err: unknown) {
    console.error("[api/crypto/dex] error:", err);
    return NextResponse.json(dexBody(null), {
      headers: { "cache-control": "no-store" },
    });
  }
}
