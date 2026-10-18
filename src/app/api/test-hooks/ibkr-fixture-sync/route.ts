import { NextResponse } from "next/server";
import { getTradeSessionUser } from "@/lib/session";
import { testHooksAllowedFor } from "@/lib/test-hooks";
import { applyFlexStatement } from "@/lib/broker-sync/ibkr-sync.server";
import { IBKR_FLEX_FIXTURE } from "@/lib/broker-sync/ibkr-flex-fixture";

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
