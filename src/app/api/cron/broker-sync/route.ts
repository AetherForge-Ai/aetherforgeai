import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { totalumSdk } from "@/lib/totalum";
import { brokerKeyConfigured } from "@/lib/broker-sync/token-crypto.server";
import { listActiveConnections } from "@/lib/broker-sync/connection-store.server";
import { syncConnection } from "@/lib/broker-sync/ibkr-sync.server";

export const dynamic = "force-dynamic";

/**
 * Daily IBKR Flex sync for every active connection. Same CRON_SECRET contract as the other
 * cron routes (?key=, x-cron-secret or Bearer). Disabled (503) without CRON_SECRET or
 * BROKER_TOKEN_KEY. Members run one at a time, 7 s apart (IBKR: 10 requests/min per token).
 */
function secretOk(req: Request): boolean {
  const expected = process.env.CRON_SECRET || "";
  if (!expected) return false;
  const url = new URL(req.url);
  const auth = req.headers.get("authorization");
  const given = url.searchParams.get("key") || req.headers.get("x-cron-secret") || (auth?.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "");
  const a = Buffer.from(given || "");
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function handle(req: Request) {
  if (!process.env.CRON_SECRET) return NextResponse.json({ ok: false, error: "Broker sync cron is not configured (missing CRON_SECRET)." }, { status: 503 });
  if (!secretOk(req)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!brokerKeyConfigured()) return NextResponse.json({ ok: false, error: "Broker sync is off (missing BROKER_TOKEN_KEY)." }, { status: 503 });
  const conns = await listActiveConnections().catch(() => []);
  let ok = 0;
  let failed = 0;
  for (const conn of conns) {
    const res = await totalumSdk.crud.getRecordById("user", conn.user).catch(() => null);
    const user = (res as { data?: { _id?: string } } | null)?.data;
    if (!user?._id) continue;
    const out = await syncConnection(user as never, conn);
    if (out.ok) ok += 1;
    else failed += 1;
    await new Promise((r) => setTimeout(r, 7_000));
  }
  return NextResponse.json({ ok: true, connections: conns.length, synced: ok, failed });
}

export const GET = handle;
export const POST = handle;
