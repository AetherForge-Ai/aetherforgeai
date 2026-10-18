import { NextResponse } from "next/server";
import { getTradeSessionUser } from "@/lib/session";
import { takeRateLimit } from "@/lib/ip-rate-limit";
import { BROKER_KEY_MISSING, brokerKeyConfigured, encryptToken } from "@/lib/broker-sync/token-crypto.server";
import { deleteConnection, findConnection, publicConnection, saveConnection } from "@/lib/broker-sync/connection-store.server";
import { validFlexToken, validQueryId } from "@/lib/broker-sync/ibkr-flex";

export const dynamic = "force-dynamic";
const PRIVATE = { "Cache-Control": "private, no-store" };

/** GET: connection status only (never the token). */
export async function GET() {
  const user = await getTradeSessionUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  try {
    const conn = await findConnection(user._id, "ibkr");
    return NextResponse.json({ ok: true, data: { configured: brokerKeyConfigured(), connection: publicConnection(conn) } }, { headers: PRIVATE });
  } catch (err) {
    return NextResponse.json({ ok: true, data: { configured: brokerKeyConfigured(), connection: null, notice: err instanceof Error ? err.message : null } }, { headers: PRIVATE });
  }
}

/** POST { token, queryId }: encrypt and store. The token is not echoed back. */
export async function POST(req: Request) {
  const user = await getTradeSessionUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const limit = await takeRateLimit(`broker-connect:${user._id}`, 10, 60 * 60 * 1000);
  if (!limit.allowed) return NextResponse.json({ ok: false, error: "Too many attempts. Try again later." }, { status: 429, headers: PRIVATE });
  if (!brokerKeyConfigured()) return NextResponse.json({ ok: false, error: BROKER_KEY_MISSING }, { status: 503, headers: PRIVATE });
  const body = (await req.json().catch(() => ({}))) as { token?: unknown; queryId?: unknown };
  const token = String(body.token ?? "").trim();
  const queryId = String(body.queryId ?? "").trim();
  if (!validFlexToken(token)) return NextResponse.json({ ok: false, error: "That does not look like an IBKR Flex token (digits only)." }, { status: 400, headers: PRIVATE });
  if (!validQueryId(queryId)) return NextResponse.json({ ok: false, error: "That does not look like a Flex Query ID (digits only)." }, { status: 400, headers: PRIVATE });
  try {
    await saveConnection(user._id, "ibkr", await encryptToken(token, user._id), queryId);
    const conn = await findConnection(user._id, "ibkr");
    return NextResponse.json({ ok: true, data: { connection: publicConnection(conn) } }, { headers: PRIVATE });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "Not saved." }, { status: 503, headers: PRIVATE });
  }
}

/** DELETE: disconnect. The stored ciphertext is deleted. */
export async function DELETE() {
  const user = await getTradeSessionUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  try {
    const removed = await deleteConnection(user._id, "ibkr");
    return NextResponse.json({ ok: true, data: { removed } }, { headers: PRIVATE });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "Not removed." }, { status: 503, headers: PRIVATE });
  }
}
