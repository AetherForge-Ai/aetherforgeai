import { NextResponse } from "next/server";
import { getTradeSessionUser } from "@/lib/session";
import { testHooksAllowedFor } from "@/lib/test-hooks";
import { totalumSdk } from "@/lib/totalum";
import { importRowsByIds, planImportUndo, planUndoRows } from "@/lib/import-undo-plan";
import { currentCashNzd } from "@/lib/import-undo-server";
import { undoImportInOrder } from "@/lib/import-commit";
import { planOrApplyLedgerReversal } from "@/lib/ledger-reversal-apply";
import { invalidateBookCache } from "@/lib/book-cache";

export const dynamic = "force-dynamic";
const NO_STORE = { "cache-control": "private, no-store, max-age=0" };
const notFound = () => NextResponse.json({ ok: false, error: "Not found" }, { status: 404, headers: NO_STORE });

/**
 * b87 H-10: test-hook-only cleanup of import rows on the signed-in allow-listed test account
 * (GOAL_TEST_HOOKS=1 + GOAL_TEST_HOOK_USER_IDS). Only rows carrying an import batch= tag and owned by
 * that account. Same whole-batch plan as import undo: on any refusal nothing is changed.
 * GET  ?batchId=… or ?ids=a,b  → dry run (plan only, writes 0)
 * POST { batchId } or { ids: [...], apply: true } → applies the plan
 */
async function run(user: { _id: string }, sel: { batchId?: string; ids?: string[] }, apply: boolean) {
  const res = await totalumSdk.crud.query("transaction", { _filter: { user: user._id }, _limit: 5000 });
  const ledger = ((res?.data as unknown as Array<{ _id: string; notes?: string | null }>) || []).filter((r) => r?._id) as never[];
  const cash = await currentCashNzd(user._id);
  const plan = sel.batchId
    ? planImportUndo({ ledger, batchId: sel.batchId, cashNzd: cash })
    : planUndoRows(ledger, importRowsByIds(ledger, sel.ids || []), cash);
  if (plan.ok === false) {
    return NextResponse.json({ ok: false, dryRun: !apply, error: plan.error, ids: plan.ids, writes: 0 }, { status: plan.ids.length ? 400 : 404, headers: NO_STORE });
  }
  if (!apply) {
    return NextResponse.json({ ok: true, dryRun: true, ids: plan.ids, cashBefore: plan.cashBefore, cashAfter: plan.cashAfter, writes: 0 }, { headers: NO_STORE });
  }
  const outcome = await undoImportInOrder(plan.ids, async (id) => {
    await planOrApplyLedgerReversal(id, true);
  });
  invalidateBookCache(user._id);
  return NextResponse.json(
    { ok: !outcome.error, dryRun: false, ids: plan.ids, removed: outcome.undone, error: outcome.error, cashBefore: plan.cashBefore, cashAfter: plan.cashAfter },
    { status: outcome.error ? 500 : 200, headers: NO_STORE }
  );
}

function selection(batchId: unknown, ids: unknown) {
  const b = typeof batchId === "string" ? batchId.trim() : "";
  const list = Array.isArray(ids) ? ids.map(String) : typeof ids === "string" ? ids.split(",") : [];
  return b ? { batchId: b } : { ids: list.map((v) => v.trim()).filter(Boolean) };
}

export async function GET(req: Request) {
  const user = await getTradeSessionUser();
  if (!user || !testHooksAllowedFor(user as { _id?: string })) return notFound();
  const q = new URL(req.url).searchParams;
  const sel = selection(q.get("batchId"), q.get("ids"));
  if (!sel.batchId && !sel.ids?.length) return NextResponse.json({ ok: false, error: "Give batchId or ids." }, { status: 400, headers: NO_STORE });
  return run(user as { _id: string }, sel, false);
}

export async function POST(req: Request) {
  const user = await getTradeSessionUser();
  if (!user || !testHooksAllowedFor(user as { _id?: string })) return notFound();
  const body = (await req.json().catch(() => ({}))) as { batchId?: unknown; ids?: unknown; apply?: unknown };
  const sel = selection(body.batchId, body.ids);
  if (!sel.batchId && !sel.ids?.length) return NextResponse.json({ ok: false, error: "Give batchId or ids." }, { status: 400, headers: NO_STORE });
  return run(user as { _id: string }, sel, body.apply === true);
}
