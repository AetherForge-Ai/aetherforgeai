import { NextResponse } from "next/server";
import { getTradeSessionUser } from "@/lib/session";
import { testHooksAllowedFor } from "@/lib/test-hooks";
import { applyFlexStatement } from "@/lib/broker-sync/ibkr-sync.server";
import { IBKR_FLEX_FIXTURE } from "@/lib/broker-sync/ibkr-flex-fixture";
import { flexCashRows, flexTradesCsv } from "@/lib/broker-sync/ibkr-flex";
import { runH10Import } from "@/lib/import/persist";
import { BROKER_KEY_MISSING, brokerKeyConfigured, encryptToken } from "@/lib/broker-sync/token-crypto.server";
import { deleteConnection, findConnection, publicConnection, saveConnection } from "@/lib/broker-sync/connection-store.server";
import { SANDBOX_QUERY_ID, SANDBOX_TOKEN_OK, sandboxVerify } from "@/lib/broker-sync/ibkr-sandbox";

const PRIVATE = { "Cache-Control": "private, no-store" };

export const dynamic = "force-dynamic";

/**
 * b34 BS-01 (GOAL-LOCK #66): runs the real sync code (applyFlexStatement: H-10 commit, duplicate
 * check by IBKR id, cash rows) against the bundled fixture statement instead of the IBKR network
 * call, so TT can see the commit within NZ$0.01 and a second run adding 0 rows. 404 for anyone not
 * in GOAL_TEST_HOOK_USER_IDS (with GOAL_TEST_HOOKS=1).
 */
export async function POST(req?: Request) {
  const user = await getTradeSessionUser();
  if (!user || !testHooksAllowedFor(user as { _id?: string; email?: string })) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }
  // b91 BS-01: one gradable POST path for the whole locked test. No body or {action:"sync"} keeps
  // the b34 behaviour. {action:"connect", token} stores a sandbox token encrypted (an invalid or
  // expired sandbox token is refused with nothing saved); {action:"disconnect"} deletes the row.
  // Sandbox tokens only: no real token, no IBKR call, no scheduled job.
  const body = (await req?.json().catch(() => ({}))) as { action?: unknown; token?: unknown } | undefined;
  const action = String(body?.action ?? "sync");
  const uid = String((user as { _id: string })._id);
  if (action === "connect") {
    const token = String(body?.token ?? SANDBOX_TOKEN_OK).trim();
    const check = sandboxVerify(token);
    if (check.ok === false) return NextResponse.json({ ok: false, sandbox: true, code: check.code, error: `${check.message} Nothing was saved.` }, { status: 400, headers: PRIVATE });
    if (!brokerKeyConfigured()) return NextResponse.json({ ok: false, error: BROKER_KEY_MISSING }, { status: 503, headers: PRIVATE });
    try {
      await saveConnection(uid, "ibkr", await encryptToken(token, uid), SANDBOX_QUERY_ID);
      return NextResponse.json({ ok: true, sandbox: true, connection: publicConnection(await findConnection(uid, "ibkr")) }, { headers: PRIVATE });
    } catch (err) {
      return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "Not saved." }, { status: 503, headers: PRIVATE });
    }
  }
  if (action === "disconnect") {
    try {
      const removed = await deleteConnection(uid, "ibkr");
      const after = await findConnection(uid, "ibkr").catch(() => null);
      return NextResponse.json({ ok: true, sandbox: true, removed, stored: !!after }, { headers: PRIVATE });
    } catch (err) {
      return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "Not removed." }, { status: 503, headers: PRIVATE });
    }
  }
  if (action !== "sync") return NextResponse.json({ ok: false, error: "Unknown action. Use sync, connect or disconnect." }, { status: 400, headers: PRIVATE });
  try {
    const result = await applyFlexStatement(user as never, IBKR_FLEX_FIXTURE);
    return NextResponse.json({ ok: true, fixture: "ibkr-flex-statement.xml", ...result });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "Sync failed. Nothing more was saved." }, { status: 500 });
  }
}

/**
 * b85 BS-01: preview only. Parses the bundled fixture Flex statement through the same H-10 preview
 * the commit uses and lists the cash rows, and writes nothing. Same allow-list as POST (404 otherwise).
 * No real token, no IBKR call, no scheduled job.
 */
export async function GET() {
  const user = await getTradeSessionUser();
  if (!user || !testHooksAllowedFor(user as { _id?: string; email?: string })) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }
  const csv = flexTradesCsv(IBKR_FLEX_FIXTURE);
  const res = await runH10Import(user as never, csv, { engine: "h10", action: "preview" }, "broker-sync");
  const preview = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const cash = flexCashRows(IBKR_FLEX_FIXTURE).map((r) => ({ id: r.id, kind: r.kind, date: r.date, symbol: r.symbol, amount: r.amount, currency: r.currency, fxRateToBase: r.fxRateToBase }));
  return NextResponse.json({ ok: res.ok, fixture: "ibkr-flex-statement.xml", mode: "preview", writes: 0, trades: preview, cash });
}
