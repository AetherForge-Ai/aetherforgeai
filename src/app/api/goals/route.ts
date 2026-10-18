import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/session";
import { totalumSdk } from "@/lib/totalum";
import { HEADMASTER_GOALS } from "@/lib/feature-flags";
import { monthsUntil } from "@/lib/goal-math";
import { ownerOf, tableFailure } from "@/lib/user-table.server";
import { isFreeReportPlan } from "@/lib/entitlements";

/** b26 H-11: goals are a paid feature (Starter, Pro, Ultimate). */
const paidOnly = () => NextResponse.json({ ok: false, error: "Goals are included on Starter and above.", data: { code: "not_entitled" } }, { status: 403 });

/** The live `goal` table may not have a start_nzd column yet (K-01). Retry without it. */
async function writeWithStart<T>(fields: Record<string, unknown>, write: (f: Record<string, unknown>) => Promise<T>): Promise<{ res: T; startSaved: boolean }> {
  try {
    return { res: await write(fields), startSaved: fields.start_nzd !== undefined };
  } catch (err) {
    if (fields.start_nzd === undefined) throw err;
    console.warn("[api/goals] write with start_nzd failed; retrying without it:", err instanceof Error ? err.message.slice(0, 120) : "error");
    const { start_nzd: _drop, ...rest } = fields;
    void _drop;
    return { res: await write(rest), startSaved: false };
  }
}

export const dynamic = "force-dynamic";

/**
 * Goal b22 H-11: Headmaster goals on the Totalum `goal` table
 * (user relation, target_nzd, target_date, monthly_nzd, annual_return_pct, label).
 * Behind HEADMASTER_GOALS (default off → 404). Every read and write is filtered by the caller.
 */
const goalSchema = z.object({
  label: z.string().trim().max(80).optional(),
  target_nzd: z.number().positive().max(1e10),
  target_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  monthly_nzd: z.number().min(0).max(1e8),
  annual_return_pct: z.number().min(-50).max(50),
  /** b26 H-11: the starting amount the goal grows from. */
  start_nzd: z.number().min(0).max(1e10).optional(),
});
const patchSchema = goalSchema.partial().extend({ id: z.string().min(1) });

const off = () => NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
const unauth = () => NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

function dateProblem(d?: string): string | null {
  if (d == null) return null;
  const m = monthsUntil(d);
  if (!Number.isFinite(m)) return "Enter a valid date.";
  if (m <= 0) return "Choose a date in the future.";
  return null;
}

async function ownGoal(userId: string, id: string) {
  const r = await totalumSdk.crud.getRecordById("goal", id);
  const row = (r as { data?: { _id?: string; user?: unknown } } | null)?.data;
  return row?._id && ownerOf(row as Record<string, unknown>) === userId ? row : null;
}

export async function GET() {
  if (!HEADMASTER_GOALS) return off();
  const user = await getCurrentUser();
  if (!user) return unauth();
  try {
    const res = await totalumSdk.crud.query("goal", { _filter: { user: user._id }, _limit: 50 });
    const rows = ((res?.data as unknown as Array<Record<string, unknown>>) || []).filter((r) => ownerOf(r) === String(user._id));
    return NextResponse.json({ ok: true, data: rows });
  } catch (err) {
    return tableFailure("goal", err);
  }
}

export async function POST(req: Request) {
  if (!HEADMASTER_GOALS) return off();
  const user = await getCurrentUser();
  if (!user) return unauth();
  if (isFreeReportPlan(user.subscription_plan)) return paidOnly();
  const parsed = goalSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message || "Invalid goal" }, { status: 400 });
  const problem = dateProblem(parsed.data.target_date);
  if (problem) return NextResponse.json({ ok: false, error: problem }, { status: 400 });
  try {
    const { res: created, startSaved } = await writeWithStart({ ...parsed.data, label: parsed.data.label || "Goal", user: user._id }, (f) => totalumSdk.crud.createRecord("goal", f));
    return NextResponse.json({ ok: true, data: (created as { data?: unknown })?.data ?? null, startSaved });
  } catch (err) {
    return tableFailure("goal", err);
  }
}

export async function PATCH(req: Request) {
  if (!HEADMASTER_GOALS) return off();
  const user = await getCurrentUser();
  if (!user) return unauth();
  if (isFreeReportPlan(user.subscription_plan)) return paidOnly();
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message || "Invalid goal" }, { status: 400 });
  const { id, ...fields } = parsed.data;
  const problem = dateProblem(fields.target_date);
  if (problem) return NextResponse.json({ ok: false, error: problem }, { status: 400 });
  try {
    if (!(await ownGoal(String(user._id), id))) return NextResponse.json({ ok: false, error: "That goal was not found." }, { status: 404 });
    const { res: updated, startSaved } = await writeWithStart(fields, (f) => totalumSdk.crud.editRecordById("goal", id, f));
    return NextResponse.json({ ok: true, data: (updated as { data?: unknown })?.data ?? null, startSaved });
  } catch (err) {
    return tableFailure("goal", err);
  }
}

export async function DELETE(req: Request) {
  if (!HEADMASTER_GOALS) return off();
  const user = await getCurrentUser();
  if (!user) return unauth();
  const id = new URL(req.url).searchParams.get("id")?.trim() || "";
  if (!id) return NextResponse.json({ ok: false, error: "A goal id is required." }, { status: 400 });
  try {
    if (!(await ownGoal(String(user._id), id))) return NextResponse.json({ ok: false, error: "That goal was not found." }, { status: 404 });
    await totalumSdk.crud.deleteRecordById("goal", id);
    return NextResponse.json({ ok: true, data: { id } });
  } catch (err) {
    return tableFailure("goal", err);
  }
}
