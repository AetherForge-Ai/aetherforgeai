import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/session";
import { totalumSdk } from "@/lib/totalum";
import { money, ownerOf, tableFailure } from "@/lib/user-table.server";

export const dynamic = "force-dynamic";

/**
 * Goal b22 G-21: whole-wealth storage.
 * - `wealth_item` (user, kind kiwisaver|cash|property|other|debt, label, value_nzd)
 * - `wealth_history` (user, day yyyy-mm-dd, net_worth_nzd), one point per Auckland day
 * - user.wealth_goal_nzd
 * A missing table answers 503 code "table_missing" and the panel keeps its browser copy.
 */
type Row = Record<string, unknown> & { _id?: string };
const KINDS = ["kiwisaver", "cash", "property", "other", "debt"] as const;
const itemSchema = z.object({ kind: z.enum(KINDS), label: z.string().trim().max(80).optional(), value_nzd: z.number().min(0).max(1e11) });
const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("add") }).merge(itemSchema),
  z.object({ action: z.literal("remove"), id: z.string().min(1) }),
  z.object({ action: z.literal("goal"), goal_nzd: z.number().min(0).max(1e11).nullable() }),
  z.object({ action: z.literal("history"), day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), net_worth_nzd: z.number() }),
  z.object({
    action: z.literal("migrate"),
    items: z.array(itemSchema).max(200),
    history: z.array(z.object({ day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), net_worth_nzd: z.number() })).max(400),
    goal_nzd: z.number().min(0).max(1e11).nullable(),
  }),
]);

async function rows(table: string, userId: string, limit: number): Promise<Row[]> {
  const res = await totalumSdk.crud.query(table, { _filter: { user: userId }, _limit: limit });
  return ((res?.data as unknown as Row[]) || []).filter((r) => ownerOf(r) === userId);
}

const view = (items: Row[], history: Row[], goal: unknown) => ({
  items: items.map((r) => ({ id: String(r._id), kind: String(r.kind), label: String(r.label || ""), valueNzd: money(r.value_nzd) ?? 0 })),
  history: history
    .map((h) => ({ day: String(h.day), netWorthNzd: money(h.net_worth_nzd) ?? 0 }))
    .sort((a, b) => a.day.localeCompare(b.day))
    .slice(-366),
  goalNzd: money(goal),
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const uid = String(user._id);
  try {
    const [items, history] = await Promise.all([rows("wealth_item", uid, 200), rows("wealth_history", uid, 400)]);
    return NextResponse.json({ ok: true, data: view(items, history, (user as { wealth_goal_nzd?: unknown }).wealth_goal_nzd) });
  } catch (err) {
    return tableFailure("wealth_item", err);
  }
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const uid = String(user._id);
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message || "Invalid request" }, { status: 400 });
  const b = parsed.data;
  try {
    if (b.action === "add") {
      const created = await totalumSdk.crud.createRecord("wealth_item", { user: uid, kind: b.kind, label: b.label || b.kind, value_nzd: money(b.value_nzd) });
      return NextResponse.json({ ok: true, data: { id: String((created as { data?: { _id?: string } })?.data?._id ?? "") } });
    }
    if (b.action === "remove") {
      const r = await totalumSdk.crud.getRecordById("wealth_item", b.id).catch(() => null);
      const row = (r as { data?: Row } | null)?.data;
      if (!row?._id || ownerOf(row) !== uid) return NextResponse.json({ ok: false, error: "That item was not found." }, { status: 404 });
      await totalumSdk.crud.deleteRecordById("wealth_item", b.id);
      return NextResponse.json({ ok: true, data: { id: b.id } });
    }
    if (b.action === "goal") {
      await totalumSdk.crud.editRecordById("user", uid, { wealth_goal_nzd: b.goal_nzd });
      return NextResponse.json({ ok: true, data: { goalNzd: b.goal_nzd } });
    }
    if (b.action === "history") {
      const existing = (await rows("wealth_history", uid, 400)).filter((h) => String(h.day) === b.day);
      if (existing[0]?._id) await totalumSdk.crud.editRecordById("wealth_history", existing[0]._id, { net_worth_nzd: money(b.net_worth_nzd) });
      else await totalumSdk.crud.createRecord("wealth_history", { user: uid, day: b.day, net_worth_nzd: money(b.net_worth_nzd) });
      return NextResponse.json({ ok: true, data: { day: b.day } });
    }
    // migrate: one time only. Refused once the account has saved items or history.
    const [items, history] = await Promise.all([rows("wealth_item", uid, 1), rows("wealth_history", uid, 1)]);
    if (items.length || history.length) return NextResponse.json({ ok: true, data: { migrated: false, reason: "already-saved" } });
    for (const it of b.items) await totalumSdk.crud.createRecord("wealth_item", { user: uid, kind: it.kind, label: it.label || it.kind, value_nzd: money(it.value_nzd) });
    for (const h of b.history) await totalumSdk.crud.createRecord("wealth_history", { user: uid, day: h.day, net_worth_nzd: money(h.net_worth_nzd) });
    if (b.goal_nzd != null) await totalumSdk.crud.editRecordById("user", uid, { wealth_goal_nzd: b.goal_nzd });
    return NextResponse.json({ ok: true, data: { migrated: true, items: b.items.length, history: b.history.length } });
  } catch (err) {
    return tableFailure("wealth_item", err);
  }
}
