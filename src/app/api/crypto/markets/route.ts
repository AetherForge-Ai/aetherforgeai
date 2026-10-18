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

/** b31 REG-1/H-1: short private TTL; the CDN never serves an older snapshot version. */
const CACHE_CONTROL = "private, max-age=5";

export async function GET() {
  try {
    const page = await loadTop400Markets();
    return NextResponse.json(marketsBody(page.coins, page.notice, page.at), {
      // b29 H-1: snapshot version, so a test can compare reads and catch time running backwards.
      headers: { "cache-control": CACHE_CONTROL, "CDN-Cache-Control": "no-store", "x-af-snapshot-at": page.at || "", "x-af-snapshot-version": String(page.version ?? 0) },
    });
  } catch (err: unknown) {
    console.error("[api/crypto/markets] error:", err);
    return NextResponse.json(marketsBody(null, null), {
      headers: { "cache-control": "no-store" },
    });
  }
}
