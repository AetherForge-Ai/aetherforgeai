import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/session";
import { loadTotalumSynthesis, loadReportFindings } from "@/lib/totalum-service";
import { isFullHeadmaster } from "../route";
import { createGrokChatCompletion, isGrokConfigured, type GrokMessage } from "@/lib/grok";
import { buildStrategy, type TotalumSynthesis } from "@/lib/totalum-engine";
import type { ReportFindings } from "@/lib/totalum-service";
import { modelViewSentence, requestsWatchlist, scopeHeadmasterIdeas } from "@/lib/headmaster-trust";

export const dynamic = "force-dynamic";

const postSchema = z.object({
  message: z.string().min(1, "Message is required").max(2000),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) }))
    .max(12)
    .optional(),
});

const STRATEGIST_SYSTEM_PROMPT = `You are "The Headmaster", the Portfolio Planning and Strategies agent inside the AetherForge AI platform.
You answer questions about the member's current cross-asset book — NZX/ASX/global equities, crypto and physical precious metals — in one NZD picture.
This tab is questions and answers. It is not an order ticket. You do not place trades.
Speak in scenarios and illustrative alternatives. Do not instruct the member to BUY, ACCUMULATE, or treat a signal as a Strong Buy.
Default scope is current holdings. Name a ticker that is not held only when the member explicitly asks for watchlist ideas, and then put those names under a heading "Watchlist ideas — not held, not instructions".
When you mention cash movement, use the retained-cash and illustrated-reallocation figures in the snapshot. Never tell the member to deploy the entire cash balance.
Ground figures in the snapshot (all values are NZD). For "what if" questions, use the stress-test and scenario pathway figures.
Format in clean Markdown: short paragraphs, **bold** key numbers, bullet lists for scenarios. Keep replies focused.
End with a one-line reminder that this is portfolio intelligence, not personalised financial advice, and that AetherForge does not trade for you.`;

function nzd(v: number): string {
  return `NZ$${Math.round(v).toLocaleString()}`;
}

/** Compact, information-dense snapshot of the unified book for AI grounding. */
function buildStrategistContext(s: TotalumSynthesis): string {
  if (s.isEmpty) {
    return (
      "The member's unified book is empty — no equities, crypto, metals OR cash yet. " +
      "Encourage them to deposit cash in the Transaction Centre and/or add positions in Stox, Koins and the Precious Metals tracker. " +
      "Cash alone is enough to open the allocation skeleton. Do not invent tickers to buy."
    );
  }
  const lines: string[] = [];
  const cashW = s.classAllocation.find((c) => c.assetClass === "cash")?.weight ?? 0;
  const skeleton = buildStrategy(s, "balanced_growth");
  lines.push(
    `UNIFIED PORTFOLIO (base currency NZD, as of ${s.asOf}):`,
    `- Total value: ${nzd(s.totalValueNZD)} | cost ${nzd(s.totalCostNZD)} | P/L ${nzd(s.totalGainNZD)} (${s.totalGainPct.toFixed(2)}%)`,
    `- Cash on book: ${nzd(s.cashBalanceNZD)} (${cashW.toFixed(1)}% of book). Liquidity reserve, not a single-name shock.`,
    `- Default Balanced Growth skeleton (same calculation as the Strategy tab): retained cash ${nzd(skeleton.plan.retainedCashNZD)} (${skeleton.plan.targetCashPct}%). Illustrated cash reallocation ${nzd(skeleton.plan.cashToReallocateNZD)}.`,
    `- ${skeleton.plan.formula}`,
    `- Diversification score: ${s.diversificationScore}/100 (${s.concentrationLabel}, HHI ${s.hhi})`,
    `- ${modelViewSentence(s.expectedAnnualReturnPct, s.expectedAnnualVolPct)}`,
    "",
    "ASSET-CLASS ALLOCATION:"
  );
  s.classAllocation.forEach((c) =>
    lines.push(`- ${c.label}: ${c.weight.toFixed(1)}% (${nzd(c.valueNZD)}, ${c.positions} position(s))`)
  );

  lines.push("", "TOP POSITIONS:");
  s.positions.slice(0, 8).forEach((p) =>
    lines.push(`- ${p.label} [${p.assetClass}] ${p.weight.toFixed(1)}% · ${nzd(p.valueNZD)} · P/L ${p.gainPct.toFixed(1)}%`)
  );

  if (s.concentrationRisks.length) {
    lines.push("", "CONCENTRATION RISKS:");
    s.concentrationRisks.forEach((r) => lines.push(`- ${r.note}`));
  }

  lines.push("", "STRESS TESTS (impact on total value):");
  s.stressTests.forEach((t) =>
    lines.push(`- ${t.name}: ${t.impactPct >= 0 ? "+" : ""}${t.impactPct}% (${nzd(t.impactNZD)}) → ${nzd(t.newValueNZD)}`)
  );

  lines.push("", "SCENARIO PATHWAYS (bull/base/bear % of total):");
  s.scenarios.forEach((sc) =>
    lines.push(`- ${sc.horizon}: bull ${sc.bullPct}% · base ${sc.basePct}% · bear ${sc.bearPct}%`)
  );

  return lines.join("\n");
}

function heldLabels(s: TotalumSynthesis): string[] {
  return s.positions.filter((p) => p.assetClass !== "cash").map((p) => p.label);
}

function ideaBlock(message: string, s: TotalumSynthesis, findings: ReportFindings): string {
  const scoped = scopeHeadmasterIdeas(findings.ideas || [], heldLabels(s), requestsWatchlist(message));
  return ["", scoped.contextBlock].join("\n");
}

/** Deterministic fallback answer when the AI provider is not configured. */
function deterministicReply(message: string, s: TotalumSynthesis, findings: ReportFindings): string {
  if (s.isEmpty) {
    return `Your unified book is empty — no cash, equities, crypto or metals yet. **Deposit cash** in the Transaction Centre and/or add positions in **Stox**, **Koins**, and the **Precious Metals** tracker. Cash alone is enough to open an allocation skeleton. I will not invent tickers.\n\n_Portfolio intelligence, not personalised financial advice. AetherForge does not trade for you._`;
  }
  const top = s.classAllocation[0];
  const worstStress = [...s.stressTests].sort((a, b) => a.impactNZD - b.impactNZD)[0];
  const lines = [
    `Here's the read on your **${nzd(s.totalValueNZD)}** unified book (${s.concentrationLabel}, diversification **${s.diversificationScore}/100**):`,
    "",
    `- **Allocation:** ${s.classAllocation.map((c) => `${c.label} ${c.weight.toFixed(0)}%`).join(" · ")}`,
    `- **Largest sleeve:** ${top.label} at **${top.weight.toFixed(1)}%** (${nzd(top.valueNZD)}).`,
    worstStress
      ? `- **Biggest downside stress:** ${worstStress.name} would cost **${nzd(Math.abs(worstStress.impactNZD))}** (${worstStress.impactPct}%).`
      : "",
    s.concentrationRisks[0] ? `- **Watch:** ${s.concentrationRisks[0].note}` : "",
    ideaBlock(message, s, findings),
    "",
    "The **Strategy** tab is the allocation skeleton (retained cash and illustrative class amounts). **Scenarios** and **Stress** are pathways and shocks. This chat only answers questions about that picture.",
    "",
    "_Portfolio intelligence, not personalised financial advice. AetherForge does not trade for you._",
  ];
  return lines.filter(Boolean).join("\n");
}

// POST /api/totalum/chat — converse with the Chief Strategist
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    if (!isFullHeadmaster(user)) {
      return NextResponse.json(
        { ok: false, error: "The Headmaster strategist is included with Pro.", data: { code: "not_entitled" } },
        { status: 403 }
      );
    }

    const body = (await req.json().catch(() => ({}))) as unknown;
    const parsed = postSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
    }

    const [synthesis, findings] = await Promise.all([
      loadTotalumSynthesis(user._id),
      loadReportFindings(user._id),
    ]);
    const scoped = scopeHeadmasterIdeas(
      findings.ideas || [],
      heldLabels(synthesis),
      requestsWatchlist(parsed.data.message)
    );
    const context = `${buildStrategistContext(synthesis)}\n\n${findings.contextBlock}\n\n${scoped.contextBlock}`;

    // Graceful deterministic fallback when no AI key is configured.
    if (!isGrokConfigured()) {
      console.log("[api/totalum/chat] Grok not configured — returning deterministic strategist reply");
      return NextResponse.json({
        ok: true,
        data: { reply: deterministicReply(parsed.data.message, synthesis, findings), source: "deterministic" },
      });
    }

    const history = (parsed.data.history ?? []).map((m) => ({ role: m.role, content: m.content })) as GrokMessage[];
    const messages: GrokMessage[] = [
      {
        role: "system",
        content:
          `${STRATEGIST_SYSTEM_PROMPT}\n\n` +
          `The member's name is ${user.name}. Here is their live unified portfolio snapshot — reason from it:\n\n${context}`,
      },
      ...history,
      { role: "user", content: parsed.data.message.trim() },
    ];

    console.log(`[api/totalum/chat] Generating strategist reply for user ${user._id}`);
    let reply: string;
    try {
      reply = await createGrokChatCompletion({ messages, maxTokens: 1100, temperature: 0.6 });
    } catch (aiErr) {
      console.error("[api/totalum/chat] Grok call failed, falling back deterministically:", aiErr);
      reply = deterministicReply(parsed.data.message, synthesis, findings);
      return NextResponse.json({ ok: true, data: { reply, source: "fallback" } });
    }

    return NextResponse.json({ ok: true, data: { reply, source: "grok" } });
  } catch (err: any) {
    console.error("[api/totalum/chat] POST error:", err);
    return NextResponse.json({ ok: false, error: err?.message || "Failed to reach the strategist" }, { status: 500 });
  }
}
