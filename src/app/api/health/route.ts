import { NextRequest, NextResponse } from "next/server";
import { EDGE_FLAGS_HEADER, healthFlags } from "@/lib/diag-flags";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * DIAG-FLAGS-1: on/off only. `runtime` is this handler's process.env.
 * `edge` is the middleware bundle's build-time snapshot, carried in x-af-edge-flags.
 * No flag value, no allow-list, no count.
 */
export async function GET(request: NextRequest) {
  return NextResponse.json(
    { flags: healthFlags(request.headers.get(EDGE_FLAGS_HEADER)) },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}
