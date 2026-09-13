import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/session";
import { loadTotalumSynthesis, loadReportFindings } from "@/lib/totalum-service";
import { isTotalumEntitled } from "../route";
import { createGrokChatCompletion, isGrokConfigured, type GrokMessage } from "@/lib/grok";
import type { TotalumSynthesis } from "@/lib/totalum-engine";
import type { ReportFindings } from "@/lib/totalum-service";

export const dynamic = "force-dynamic";

const postSchema = z.object({
  message: z.string().min(1, "Message is required").max(2000),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) }))
    .max(12)
    .optional(),
});

const STRATEGIST_SYSTEM_PROMPT = `You are "The Headmaster", the Portfolio Planning and Strategies agent and Chief Strategist inside the AetherForge AI platform.
You orchestrate the member's ENTIRE cross-asset book — NZX/ASX/global equities, crypto and physical precious metals — into one unified NZD wealth system.
You think holistically across asset classes: allocation, diversification, concentration, correlation, drawdown risk, hedging and rebalancing toward the member's goals.
Speak like a seasoned Chief Investment Strategist briefing a private client: decisive, concrete, numerate. Always ground statements in the portfolio snapshot provided and cite real figures from it (all values are NZD).
When asked "what if" questions (e.g. a crypto crash), reason from the asset-class weights and the stress-test / scenario figures given.
You are also fed the member's LATEST FULL-REPORT FINDINGS from BOTH report systems — the Stox Full Report (NZX/ASX/NASDAQ/DOW equities) and the Koins Full Report (the complete crypto market). Factor the projections and specific BUY recommendations from BOTH into a more specific, in-depth strategic plan.
MANDATORY SPECIFICITY: whenever you suggest BUYS, explicitly NAME the specific tickers/coins to buy and give concrete, structured reasoning for each — drawn from the Stox and Koins report findings and the portfolio snapshot above. Never give vague or generic advice.
Format in clean Markdown: short paragraphs, **bold** key numbers, bullet lists for actions. Keep replies focused (a few hundred words max).
End with a one-line, non-legalese reminder that this is portfolio intelligence, not personalised financial advice.`;

function nzd(v: number): string {
  return `NZ$${Math.round(v).toLocaleString()}`;
}

/** Compact, information-dense snapshot of the unified book for AI grounding. */
function buildStrategistContext(s: TotalumSynthesis): string {
  if (s.isEmpty) {
    return "The member has no cash and no holdings yet. Encourage them to deposit NZD cash in the Transaction Ledger and/or add equities (Stox), crypto (Koins), or precious metals — The Headmaster works with any mix, including cash-only.";
  }
  const cashOnly = s.positions.length > 0 && s.positions.every((p) => p.assetClass === "cash");
  if (cashOnly) {
    return `The member is cash-only with NZ$${s.totalValueNZD.toLocaleString("en-NZ")} deployable. Help them pick an overview goal (Conservative Growth, High Risk/High Reward, etc.) and suggest concrete Stox/Koins/metals buys that deploy that cash — they do NOT need existing holdings to plan.`;
  }
  const lines: string[] = [];
  lines.push(
    `UNIFIED PORTFOLIO (base currency NZD, as of ${s.asOf}):`,
    `- Total value: ${nzd(s.totalValueNZD)} | cost ${nzd(s.totalCostNZD)} | P/L ${nzd(s.totalGainNZD)} (${s.totalGainPct.toFixed(2)}%)`,
    `- Diversification score: ${s.diversificationScore}/100 (${s.concentrationLabel}, HHI ${s.hhi})`,
    `- Expected: ≈${s.expectedAnnualReturnPct}% annual return at ≈${s.expectedAnnualVolPct}% volatility`,
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

/** Renders the combined Stox + Koins specific-BUY list for grounding replies. */
function buyBlock(findings: ReportFindings): string {
  if (!findings.buys.length) return "";
  const top = findings.buys
    .slice()
    .sort((a, b) => b.projected7dPct - a.projected7dPct)
    .slice(0, 6);
  const lines = top.map(
    (b) =>
      `- **${b.ticker}** — ${b.name} · _${b.market}_ · projected **${b.projected7dPct >= 0 ? "+" : ""}${b.projected7dPct}%** (7d)${
        b.reason ? ` — ${b.reason}` : ""
      }`
  );
  return ["", "**Specific BUYS drawn from your latest Stox & Koins reports:**", ...lines].join("\n");
}

/** Deterministic fallback answer when the AI provider is not configured. */
function deterministicReply(message: string, s: TotalumSynthesis, findings: ReportFindings): string {
  if (s.isEmpty) {
    return `You don't have cash or holdings yet. Deposit NZD in the **Transaction Ledger** (Dashboard → Cash) and/or add equities in **Stox**, crypto in **Koins**, or metals — then I can build a plan. Headmaster works anytime with **cash alone**, stocks alone, crypto alone, or any mix.`;
  }
  const cashOnly = s.positions.length > 0 && s.positions.every((p) => p.assetClass === "cash");
  if (cashOnly) {
    return `You're cash-only with **NZ$${s.totalValueNZD.toLocaleString("en-NZ")}** ready to deploy. Pick an overview goal (e.g. Conservative Growth or High Risk / High Reward) and I'll turn that cash into a concrete buy plan across equities, crypto and metals — no existing holdings required.`;
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
    buyBlock(findings),
    "",
    "Use the **Strategy Builder** above to pick a goal and get an exact rebalancing plan, or the **Scenario Simulator** to see bull/base/bear pathways.",
    "",
    "_Portfolio intelligence, not personalised financial advice._",
  ];
  return lines.filter(Boolean).join("\n");
}

// POST /api/totalum/chat — converse with the Chief Strategist
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    if (!isTotalumEntitled(user)) {
      return NextResponse.json(
        { ok: false, error: "The Headmaster is a Pro feature for active paying members.", data: { code: "not_entitled" } },
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
    const context = `${buildStrategistContext(synthesis)}\n\n${findings.contextBlock}`;

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
