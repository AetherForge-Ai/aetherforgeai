import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { testHooksAllowedFor } from "@/lib/test-hooks";

export const dynamic = "force-dynamic";

/**
 * b35 H-15 (GOAL-LOCK #14): allow-listed, presence only. Reports whether MARKET_DATA_API_KEY is
 * present at runtime (true/false). Never the value, its length or any part of it.
 */
export async function GET() {
  const user = (await getCurrentUser().catch(() => null)) as { _id?: string; email?: string } | null;
  if (!user || !testHooksAllowedFor(user)) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  const present = !!(process.env.MARKET_DATA_API_KEY || "").trim();
  return NextResponse.json({ ok: true, marketDataKeyPresent: present }, { headers: { "Cache-Control": "private, no-store" } });
}
