import { NextResponse } from "next/server";
import { HOLDING_CAPS_V2 } from "@/lib/feature-flags";

/** b68 G-07: tells the dashboard whether the caps meter is on. HOLDING_CAPS_V2 is OFF in production. No user data. */
export async function GET() {
  return NextResponse.json({ ok: true, data: { holdingCapsV2: HOLDING_CAPS_V2 } }, { headers: { "Cache-Control": "no-store" } });
}
