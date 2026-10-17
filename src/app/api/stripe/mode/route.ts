import { NextResponse } from "next/server";
import { stripeModeSummary } from "@/lib/stripe-mode";

/** Goal b11 CR-1: which checkout mode and key TYPE the server uses. No key material. */
export async function GET() {
  return NextResponse.json({ ok: true, data: stripeModeSummary() }, { headers: { "Cache-Control": "no-store" } });
}
