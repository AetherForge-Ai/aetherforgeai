import { NextResponse } from "next/server";
import { getTradeSessionUser } from "@/lib/session";
import { testHooksAllowedFor } from "@/lib/test-hooks";
import { applyFlexStatement } from "@/lib/broker-sync/ibkr-sync.server";
import { IBKR_FLEX_FIXTURE } from "@/lib/broker-sync/ibkr-flex-fixture";
import { flexCashRows, flexTradesCsv } from "@/lib/broker-sync/ibkr-flex";
import { runH10Import } from "@/lib/import/persist";

export const dynamic = "force-dynamic";

/**
 * b34 BS-01 (GOAL-LOCK #66): runs the real sync code (applyFlexStatement: H-10 commit, duplicate
 * check by IBKR id, cash rows) against the bundled fixture statement instead of the IBKR network
 * call, so TT can see the commit within NZ$0.01 and a second run adding 0 rows. 404 for anyone not
 * in GOAL_TEST_HOOK_USER_IDS (with GOAL_TEST_HOOKS=1).
 */
export async function POST() {
  const user = await getTradeSessionUser();
  if (!user || !testHooksAllowedFor(user as { _id?: string; email?: string })) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }
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
