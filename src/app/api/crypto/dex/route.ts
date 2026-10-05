/**
 * GET /api/crypto/dex
 * Live decentralized tokens from the public GeckoTerminal API.
 * Always JSON. An empty or failed source is a plain sentence, never an HTTP 502.
 */
import { NextResponse } from "next/server";
import { dexBody } from "@/lib/crypto-api-body";
import { fetchDexTop400 } from "@/lib/crypto-coingecko";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const page = await fetchDexTop400();
    return NextResponse.json(dexBody(page.rows, page.notice), {
      headers: { "cache-control": "no-store" },
    });
  } catch (err: unknown) {
    console.error("[api/crypto/dex] error:", err);
    return NextResponse.json(dexBody(null, null), {
      headers: { "cache-control": "no-store" },
    });
  }
}
