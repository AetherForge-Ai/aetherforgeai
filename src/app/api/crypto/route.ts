/**
 * GET /api/crypto
 * There is no collection document here. Return JSON so a stray call is not Next's HTML 404.
 */
import { NextResponse } from "next/server";
import { LIVE_CRYPTO_UNAVAILABLE } from "@/lib/crypto-market";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    { ok: false, error: LIVE_CRYPTO_UNAVAILABLE },
    { headers: { "cache-control": "no-store" } }
  );
}
