import { NextResponse } from "next/server";
import { refreshMarketSnapshotsNow } from "@/lib/crypto-board-store";
import { presentedCronSecret } from "@/lib/weekly-email";

/**
 * GET|POST /api/cron/crypto-snapshot
 *
 * Refreshes the shared crypto and DEX snapshot.
 * No cron trigger is installed. wrangler.jsonc has no crons.
 * A page read serves the saved list and may start a background refresh.
 * A short isolate can freeze that work when the response ends.
 * This route is the run that is allowed to finish.
 *
 * CRON_SECRET is required. If it is missing the route stays closed.
 * This route does not send email.
 *
 * pull-check:v3-tier1a-2026-10-12
 */

export const dynamic = "force-dynamic";

async function handle(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, refreshed: false, email: "none", reason: "cron-not-configured" }, { status: 503 });
  }
  if (presentedCronSecret(req.url, req.headers) !== secret) {
    return NextResponse.json({ ok: false, refreshed: false, email: "none", reason: "unauthorized" }, { status: 401 });
  }
  const started = Date.now();
  const result = await refreshMarketSnapshotsNow();
  console.log(`[crypto-snapshot] refresh ${Date.now() - started}ms crypto=${result.cryptoReplaced} dex=${result.dexReplaced}`);
  return NextResponse.json({ ok: true, refreshed: true, email: "none", ...result });
}

export async function GET(req: Request) {
  try {
    return await handle(req);
  } catch (err) {
    console.error("[crypto-snapshot] GET error:", err instanceof Error ? err.message.slice(0, 120) : "failed");
    return NextResponse.json({ ok: false, refreshed: false, email: "none", reason: "failed" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    return await handle(req);
  } catch (err) {
    console.error("[crypto-snapshot] POST error:", err instanceof Error ? err.message.slice(0, 120) : "failed");
    return NextResponse.json({ ok: false, refreshed: false, email: "none", reason: "failed" }, { status: 500 });
  }
}
