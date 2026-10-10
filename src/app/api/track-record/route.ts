import { NextResponse } from "next/server";
import { publicScorecard } from "@/lib/forecast-store";

export const dynamic = "force-dynamic";

/** Public scorecard. Counts come from the log. An empty log has no rates. */
export async function GET() {
  return NextResponse.json(
    { ok: true, data: publicScorecard() },
    { headers: { "cache-control": "no-store" } },
  );
}
