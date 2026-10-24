import { NextResponse } from "next/server";
import { getTradeSessionUser } from "@/lib/session";
import { testHooksAllowedFor } from "@/lib/test-hooks";
import { BROKER_KEY_MISSING, brokerKeyConfigured, encryptToken } from "@/lib/broker-sync/token-crypto.server";
import { deleteConnection, findConnection, publicConnection, saveConnection } from "@/lib/broker-sync/connection-store.server";
import { syncConnection } from "@/lib/broker-sync/ibkr-sync.server";
import { SANDBOX_QUERY_ID, SANDBOX_TOKEN_EXPIRED, SANDBOX_TOKEN_INVALID, SANDBOX_TOKEN_OK, isSandboxConnection, sandboxVerify } from "@/lib/broker-sync/ibkr-sandbox";

export const dynamic = "force-dynamic";
const PRIVATE = { "Cache-Control": "private, no-store" };
const notFound = () => NextResponse.json({ ok: false, error: "Not found" }, { status: 404, headers: PRIVATE });

/**
 * b64 BS-01 sandbox: connect / sync / disconnect without a real IBKR token. 404 unless
 * GOAL_TEST_HOOKS=1 and the signed-in id is in GOAL_TEST_HOOK_USER_IDS. Never calls IBKR.
 *   GET                       status + the sandbox tokens to use
 *   POST {token}              connect (token defaults to the OK sandbox token)
 *   POST {action:"sync"}      Sync now against the bundled fixture (second run adds 0 rows)
 *   DELETE                    disconnect (row deleted)
 */
async function allowedUser() {
  if (process.env.GOAL_TEST_HOOKS !== "1") return null;
  const user = await getTradeSessionUser().catch(() => null);
  return user && testHooksAllowedFor(user as { _id?: string; email?: string }) ? user : null;
}

export async function GET() {
  const user = await allowedUser();
  if (!user) return notFound();
  const conn = await findConnection(String(user._id), "ibkr").catch(() => null);
  return NextResponse.json(
    { ok: true, sandbox: true, tokens: { ok: SANDBOX_TOKEN_OK, invalid: SANDBOX_TOKEN_INVALID, expired: SANDBOX_TOKEN_EXPIRED }, connection: publicConnection(conn), isSandbox: isSandboxConnection(conn) },
    { headers: PRIVATE }
  );
}

export async function POST(req: Request) {
  const user = await allowedUser();
  if (!user) return notFound();
  const body = (await req.json().catch(() => ({}))) as { token?: unknown; action?: unknown };
  const uid = String(user._id);
  if (body.action === "sync") {
    const conn = await findConnection(uid, "ibkr").catch(() => null);
    if (!conn || !isSandboxConnection(conn)) return NextResponse.json({ ok: false, error: "No sandbox IBKR connection. Connect first." }, { status: 404, headers: PRIVATE });
    const result = await syncConnection(user, conn);
    return NextResponse.json({ ok: result.ok, sandbox: true, error: result.ok ? undefined : result.message, data: result }, { status: result.ok ? 200 : 502, headers: PRIVATE });
  }
  if (!brokerKeyConfigured()) return NextResponse.json({ ok: false, error: BROKER_KEY_MISSING }, { status: 503, headers: PRIVATE });
  const token = String(body.token ?? SANDBOX_TOKEN_OK).trim();
  const check = sandboxVerify(token);
  if (check.ok === false) return NextResponse.json({ ok: false, sandbox: true, code: check.code, error: `${check.message} Nothing was saved.` }, { status: 400, headers: PRIVATE });
  try {
    await saveConnection(uid, "ibkr", await encryptToken(token, uid), SANDBOX_QUERY_ID);
    const conn = await findConnection(uid, "ibkr");
    return NextResponse.json({ ok: true, sandbox: true, data: { connection: publicConnection(conn) } }, { headers: PRIVATE });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "Not saved." }, { status: 503, headers: PRIVATE });
  }
}

export async function DELETE() {
  const user = await allowedUser();
  if (!user) return notFound();
  try {
    const removed = await deleteConnection(String(user._id), "ibkr");
    return NextResponse.json({ ok: true, sandbox: true, data: { removed } }, { headers: PRIVATE });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "Not removed." }, { status: 503, headers: PRIVATE });
  }
}
