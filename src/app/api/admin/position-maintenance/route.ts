/**
 * POST /api/admin/position-maintenance
 * Header: x-af-fx-correction: <AF_FX_CORRECTION_TOKEN>
 * Body: { userId?: string, apply?: boolean }
 *
 * Dry-run by default. Lists alerts on flat positions and sells whose fee was
 * never stored. Nothing is written unless apply is exactly true.
 * Not called from any page. Refuses when the token is unset.
 */
import { NextResponse } from "next/server";
import { applyPositionMaintenance, planPositionMaintenance } from "@/lib/position-maintenance-apply";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const expected = process.env.AF_FX_CORRECTION_TOKEN;
  if (!expected) {
    return NextResponse.json({ ok: false, error: "Position maintenance is not enabled" }, { status: 404 });
  }
  if (req.headers.get("x-af-fx-correction") !== expected) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as { userId?: string; apply?: boolean } | null;
  const userId = body?.userId?.trim() || undefined;
  const apply = body?.apply === true;
  try {
    const result = apply ? await applyPositionMaintenance(userId) : await planPositionMaintenance(userId);
    return NextResponse.json({ ok: true, data: result });
  } catch (err) {
    console.error("[api/admin/position-maintenance]", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Maintenance failed" },
      { status: 500 }
    );
  }
}
