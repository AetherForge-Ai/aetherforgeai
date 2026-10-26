import { NextResponse } from "next/server";
import { stripeModeSummary } from "@/lib/stripe-mode";
import { getCurrentUser } from "@/lib/session";

/** Goal b11 CR-1: which checkout mode and key TYPE the server uses. No key material.
 * b78 CR-6: userTestCheckout says whether the signed-in account checks out in Stripe test mode. */
export async function GET() {
  const user = await getCurrentUser().catch(() => null);
  return NextResponse.json({ ok: true, data: stripeModeSummary(process.env, user?._id ?? null) }, { headers: { "Cache-Control": "no-store" } });
}
