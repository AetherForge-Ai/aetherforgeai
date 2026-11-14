import { NextResponse } from "next/server";
import { getTradeSessionUser } from "@/lib/session";
import { goalTestHooksOn } from "@/lib/goal-test-hooks";
import { testHooksAllowedFor } from "@/lib/test-hooks";
import { applyTransaction } from "@/lib/transactions";
import { invalidateBookCache } from "@/lib/book-cache";
import { totalumSdk } from "@/lib/totalum";
import { holdingAfterSplit, splitNote } from "@/lib/stock-split";
import { OVERSEAS_FIXTURE_TAG, overseasFixtureRows } from "@/lib/overseas-fixture";

export const dynamic = "force-dynamic";

const NOT_FOUND = () => NextResponse.json({ ok: false, error: "Not found" }, { status: 404, headers: { "Cache-Control": "no-store" } });

/**
 * b30 H-9: seeds the overseas FIF fixture on the signed-in account. 404 for anyone not in
 * GOAL_TEST_HOOK_USER_IDS (with GOAL_TEST_HOOKS=1). No password here: the seed script signs in
 * with FIXTURE_EMAIL / FIXTURE_PASSWORD from its own environment.
 * HOOKS-PROD-OFF: GET is 404 while hooks are off (it was 405, because only POST existed).
 */
export async function GET() {
  if (!goalTestHooksOn()) return NOT_FOUND();
  const user = await getTradeSessionUser().catch(() => null);
  if (!user || !testHooksAllowedFor(user as { _id?: string; email?: string })) return NOT_FOUND();
  return NOT_FOUND();
}

export async function POST() {
  const user = await getTradeSessionUser();
  if (!goalTestHooksOn() || !user || !testHooksAllowedFor(user as { _id?: string; email?: string })) {
    return NOT_FOUND();
  }
  const { rows, split } = overseasFixtureRows();
  const done: string[] = [];
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    await applyTransaction(user, {
      ...row,
      notes: OVERSEAS_FIXTURE_TAG,
      executed_at: `${row.trade_date}T10:00:00+12:00`,
      execution_status: "filled",
      price_source: row.type === "buy" ? "user_fill" : undefined,
      confirm: true,
      idempotency_key: `h9-overseas-${user._id}-${i}`,
    } as never);
    done.push(`${row.type}:${row.ticker ?? "cash"}`);
  }
  const res = await totalumSdk.crud.query("stock", { _filter: { user: user._id }, _limit: 1000 });
  const holding = ((res?.data as unknown as Array<{ ticker?: string; shares?: number; purchase_price?: number }>) || []).find(
    (r) => String(r.ticker || "").toUpperCase() === split.ticker
  );
  if (holding) {
    const after = holdingAfterSplit(Number(holding.shares) || 0, Number(holding.purchase_price) || 0, split.ratio);
    await applyTransaction(
      user,
      {
        type: "correction",
        ticker: split.ticker,
        asset_type: "stock",
        quantity: after.shares,
        price: after.averageCost > 0 ? after.averageCost : 0.000001,
        notes: `${splitNote(split.ratio, split.date)} ${OVERSEAS_FIXTURE_TAG}`,
        executed_at: `${split.date}T00:00:00+12:00`,
        trade_date: split.date,
      } as never,
      { fromHoldingEdit: true }
    );
    done.push(`split:${split.ticker}:${split.ratio}`);
  }
  invalidateBookCache(user._id);
  return NextResponse.json({ ok: true, seeded: done }, { headers: { "Cache-Control": "no-store" } });
}
