/**
 * GET /api/crypto/dex
 * Returns the DEX rows already collected. The walk that fills toward 400
 * continues in the background and does not hold this response.
 * Always JSON. A source that is fully down is a plain sentence, never an HTTP 502.
 */
import { NextResponse } from "next/server";
import { dexBody } from "@/lib/crypto-api-body";
import { fetchDexTop400 } from "@/lib/crypto-coingecko";

export const dynamic = "force-dynamic";

/** Fresh for 30s, then stale-while-revalidate. The server keeps filling toward 400. */
const CACHE_CONTROL = "public, max-age=30, stale-while-revalidate=300";

export async function GET() {
  try {
    const page = await fetchDexTop400();
    return NextResponse.json(dexBody(page.rows, { collecting: !page.sourceDown, notice: page.notice }), {
      headers: { "cache-control": CACHE_CONTROL },
    });
  } catch (err: unknown) {
    console.error("[api/crypto/dex] error:", err);
    return NextResponse.json(dexBody(null), {
      headers: { "cache-control": "no-store" },
    });
  }
}
