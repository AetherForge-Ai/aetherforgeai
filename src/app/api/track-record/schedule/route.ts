import { NextResponse } from "next/server";
import { lastCronRuns } from "@/lib/cron-runs.server";
import { readTrackRunLog } from "@/lib/track-record-store.server";
import { shapePublicScheduleRuns } from "@/lib/schedule-runs";

export const dynamic = "force-dynamic";

/**
 * b37 G-20: the public schedule card's data. The GitHub read happens here on the server (the token
 * never leaves it). Without a token, the track-record rows' own timestamps are used. Times and outcomes
 * only.
 */
export async function GET() {
  const gh = await lastCronRuns();
  const log = gh ? [] : await readTrackRunLog();
  return NextResponse.json(
    { ok: true, data: shapePublicScheduleRuns(gh, log) },
    { headers: { "cache-control": "public, max-age=60, s-maxage=300" } }
  );
}
