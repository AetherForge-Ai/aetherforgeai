import { NextResponse } from "next/server";
import { getFxSnapshot } from "@/lib/fx";

/**
 * GET /api/fx
 * Returns current FX rates normalised to NZD so the dashboard can convert AUD
 * (.AX) and USD holdings into the Stox NZD total. Always succeeds — falls back
 * to baseline rates if the live feed is unavailable.
 */
export async function GET() {
  try {
    const snapshot = await getFxSnapshot();
    return NextResponse.json({ ok: true, data: snapshot });
  } catch (err) {
    console.error("[api/fx] Unexpected error resolving FX:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to resolve FX rates" },
      { status: 500 }
    );
  }
}
