import { NextResponse } from "next/server";
import { forecastLogText, readForecastLog } from "@/lib/forecast-store";
import { verifyChain } from "@/lib/forecast-chain";

export const dynamic = "force-dynamic";

/** The append-only log. A broken chain is not downloaded. */
export async function GET() {
  const parsed = readForecastLog();
  const verified = !parsed.error && verifyChain(parsed.records).ok;
  const body = verified ? forecastLogText() : "";
  return new NextResponse(body, {
    status: verified ? 200 : 409,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "content-disposition": 'attachment; filename="forecast-log.jsonl"',
      "cache-control": "no-store",
    },
  });
}
