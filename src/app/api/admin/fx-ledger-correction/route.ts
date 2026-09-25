/**
 * POST /api/admin/fx-ledger-correction
 * Body: { userId: string }
 * Header: x-af-fx-correction: <AF_FX_CORRECTION_TOKEN>
 *
 * Recalculates USD/AUD cash debits and credits that were stored with the
 * NZD→USD quote. Not called from any page. Refuses when the token is unset.
 */
import { NextResponse } from "next/server";
import { applyLedgerFxCorrection } from "@/lib/fx-ledger-correction-apply";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const expected = process.env.AF_FX_CORRECTION_TOKEN;
  if (!expected) {
    return NextResponse.json({ ok: false, error: "FX correction is not enabled" }, { status: 404 });
  }
  if (req.headers.get("x-af-fx-correction") !== expected) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as { userId?: string } | null;
  const userId = body?.userId?.trim();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "userId is required" }, { status: 400 });
  }
  try {
    const result = await applyLedgerFxCorrection(userId);
    return NextResponse.json({ ok: true, data: result });
  } catch (err) {
    console.error("[api/admin/fx-ledger-correction]", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Correction failed" },
      { status: 500 }
    );
  }
}
