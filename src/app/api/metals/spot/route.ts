import { NextResponse } from "next/server";
import { getMetalsSpot } from "@/lib/metals";

export const dynamic = "force-dynamic";

/**
 * GET /api/metals/spot — PUBLIC current-day gold & silver spot prices.
 *
 * Unlike /api/metals (which lists a member's holdings and is gated to paying
 * subscribers), this endpoint exposes ONLY the public benchmark spot price so
 * the home-page banner can show live gold/silver figures to any visitor. No
 * user data is returned. Prices come from the keyless gold-api.com feed
 * (USD/oz) and are also converted to NZD via the FX snapshot.
 */
export async function GET() {
  try {
    const spot = await getMetalsSpot();
    return NextResponse.json({ ok: true, data: spot });
  } catch (err: any) {
    console.error("[api/metals/spot] GET error:", err);
    return NextResponse.json({ ok: false, error: err?.message || "Failed to load spot prices" }, { status: 500 });
  }
}
