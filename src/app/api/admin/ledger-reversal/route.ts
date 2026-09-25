/**
 * POST /api/admin/ledger-reversal
 * Header: x-af-fx-correction: <AF_FX_CORRECTION_TOKEN>
 * Body: { transactionId: string, apply?: boolean }
 *
 * Dry-run by default. Describes removing one ledger row and the cash,
 * holding, and NZ$ net worth that follow. Writes only when apply is true.
 * Not called from any page. Refuses when the token is unset.
 */
import { NextResponse } from "next/server";
import { planOrApplyLedgerReversal } from "@/lib/ledger-reversal-apply";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const expected = process.env.AF_FX_CORRECTION_TOKEN;
  if (!expected) {
    return NextResponse.json({ ok: false, error: "Ledger reversal is not enabled" }, { status: 404 });
  }
  if (req.headers.get("x-af-fx-correction") !== expected) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as { transactionId?: string; id?: string; apply?: boolean } | null;
  const transactionId = (body?.transactionId || body?.id || "").trim();
  if (!transactionId) {
    return NextResponse.json({ ok: false, error: "transactionId is required" }, { status: 400 });
  }
  const apply = body?.apply === true;
  try {
    const result = await planOrApplyLedgerReversal(transactionId, apply);
    return NextResponse.json({ ok: true, data: result });
  } catch (err) {
    console.error("[api/admin/ledger-reversal]", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Reversal failed" },
      { status: 500 }
    );
  }
}
