import { NextResponse } from "next/server";
import { getTradeSessionUser } from "@/lib/session";
import { takeRateLimit } from "@/lib/ip-rate-limit";
import { BROKER_KEY_MISSING, brokerKeyConfigured } from "@/lib/broker-sync/token-crypto.server";
import { findConnection, publicConnection } from "@/lib/broker-sync/connection-store.server";
import { syncConnection } from "@/lib/broker-sync/ibkr-sync.server";

export const dynamic = "force-dynamic";
const PRIVATE = { "Cache-Control": "private, no-store" };

/** POST: Sync now. Limited to 6 an hour per member (IBKR allows 10/min per token). */
export async function POST() {
  const user = await getTradeSessionUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!brokerKeyConfigured()) return NextResponse.json({ ok: false, error: BROKER_KEY_MISSING }, { status: 503, headers: PRIVATE });
  const limit = await takeRateLimit(`broker-sync:${user._id}`, 6, 60 * 60 * 1000);
  if (!limit.allowed) return NextResponse.json({ ok: false, error: "Sync now was used a lot this hour. Try again later." }, { status: 429, headers: PRIVATE });
  try {
    const conn = await findConnection(user._id, "ibkr");
    if (!conn) return NextResponse.json({ ok: false, error: "No IBKR connection. Connect first." }, { status: 404, headers: PRIVATE });
    const result = await syncConnection(user, conn);
    const after = await findConnection(user._id, "ibkr").catch(() => null);
    return NextResponse.json({ ok: result.ok, error: result.ok ? undefined : result.message, data: { ...result, connection: publicConnection(after) } }, { status: result.ok ? 200 : 502, headers: PRIVATE });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "Sync failed." }, { status: 503, headers: PRIVATE });
  }
}
