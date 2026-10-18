import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { testHooksAllowedFor } from "@/lib/test-hooks";
import { checkTickerQuota } from "@/lib/entitlements";
import { totalumSdk } from "@/lib/totalum";

export const dynamic = "force-dynamic";

/**
 * b35 CR-6 (GOAL-LOCK #4): allow-listed, read-only. Reports the caller's plan, holding limit and
 * holding count (the same figures the 403 cap check uses on /api/transactions, /api/import and
 * /api/stocks). No ticker names, no write.
 */
export async function GET() {
  const user = (await getCurrentUser().catch(() => null)) as (Parameters<typeof checkTickerQuota>[0] & { _id: string; email?: string; plan?: string }) | null;
  if (!user || !testHooksAllowedFor(user)) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  const existing = await totalumSdk.crud.query("stock", { _filter: { user: user._id }, _limit: 1000 });
  const held = (existing?.data as unknown as Array<{ ticker?: string; asset_type?: string }>) || [];
  const out: Record<string, { used: number; limit: number | null; allowedOneMore: boolean }> = {};
  for (const kind of ["stock", "crypto"] as const) {
    const q = checkTickerQuota(user, held as never, kind);
    out[kind] = { used: q.used, limit: Number.isFinite(q.limit) ? q.limit : null, allowedOneMore: q.allowed };
  }
  return NextResponse.json({ ok: true, plan: user.plan ?? "free", holdings: out }, { headers: { "Cache-Control": "private, no-store" } });
}
