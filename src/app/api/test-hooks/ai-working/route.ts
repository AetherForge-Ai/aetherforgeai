import { NextResponse } from "next/server";
import { getTradeSessionUser } from "@/lib/session";
import { testHooksAllowedFor } from "@/lib/test-hooks";
import { showWorking } from "@/lib/ai-working";

export const dynamic = "force-dynamic";
const PRIVATE = { "Cache-Control": "private, no-store" };
const MAX_SAMPLES = 100;

/**
 * b91 G-19: grade "show your working" on preview with AI_SHOW_WORKING off. POST up to 100 sampled
 * notes as {samples:[{reply, context, asOf?}]} (the reply and the portfolio data line the chat gave
 * the AI, as returned to a test account by /api/chat). Returns each note's sources, as-of,
 * confidence and unsupported figures, plus totals. Pure check: no AI call, no writes, no new table.
 * 404 unless GOAL_TEST_HOOKS=1 and the signed-in id is allow-listed.
 */
export async function POST(req: Request) {
  const user = await getTradeSessionUser().catch(() => null);
  if (!user || !testHooksAllowedFor(user as { _id?: string; email?: string })) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404, headers: PRIVATE });
  }
  const body = (await req.json().catch(() => ({}))) as { samples?: unknown };
  const raw = Array.isArray(body.samples) ? body.samples : [];
  if (raw.length === 0) return NextResponse.json({ ok: false, error: "Send samples: [{reply, context}]." }, { status: 400, headers: PRIVATE });
  if (raw.length > MAX_SAMPLES) return NextResponse.json({ ok: false, error: `At most ${MAX_SAMPLES} samples.` }, { status: 400, headers: PRIVATE });
  const notes = raw.map((s, i) => {
    const r = (s ?? {}) as { reply?: unknown; context?: unknown; asOf?: unknown };
    const w = showWorking(String(r.reply ?? ""), String(r.context ?? ""), { asOf: typeof r.asOf === "string" ? r.asOf : null });
    return { index: i, sources: w.sources.length, asOf: w.asOf, confidence: w.confidence, checkedNumbers: w.checkedNumbers, unsupported: w.unsupported };
  });
  return NextResponse.json(
    {
      ok: true,
      flag: "AI_SHOW_WORKING (unchanged)",
      notes: notes.length,
      notesWithSource: notes.filter((n) => n.sources >= 1).length,
      unsupportedNumbers: notes.reduce((t, n) => t + n.unsupported.length, 0),
      results: notes,
    },
    { headers: PRIVATE }
  );
}
