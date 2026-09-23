import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/session";
import {
  createGrokChatCompletion,
  isGrokConfigured,
  type GrokMessage,
} from "@/lib/grok";
import {
  PORTFOLIO_COACH_SYSTEM_PROMPT,
  portfolioCoachFallbackReply,
} from "@/lib/portfolio-coach-knowledge";
import { isTotalumEntitled } from "@/app/api/totalum/route";
import { loadTotalumSynthesis, loadReportFindings } from "@/lib/totalum-service";

export const dynamic = "force-dynamic";

const attachedReportSchema = z.object({
  id: z.string().max(80).optional(),
  title: z.string().max(200),
  bot: z.enum(["stock", "crypto"]).optional(),
  summary: z.string().max(6000).optional(),
  generatedAt: z.string().max(80).optional(),
});

const postSchema = z.object({
  message: z.string().min(1, "Message is required").max(2000),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(4000),
      })
    )
    .max(12)
    .optional(),
  /** Optional client-supplied Headmaster plan / strategy text. */
  headmasterPlan: z.string().max(12000).optional(),
  /** Optional Stox / Koins report payloads attached in the coach UI. */
  attachedReports: z.array(attachedReportSchema).max(5).optional(),
});

function nzd(v: number): string {
  return `NZ$${Math.round(v).toLocaleString()}`;
}

function buildHeadmasterContextBlock(
  synthesis: Awaited<ReturnType<typeof loadTotalumSynthesis>>,
  findings: Awaited<ReturnType<typeof loadReportFindings>>
): string {
  const lines: string[] = [];
  if (synthesis.isEmpty) {
    lines.push(
      "Headmaster book snapshot: empty (no cash, equities, crypto or metals recorded yet).",
      "Coach the member to deposit cash and/or add holdings in Transaction Center before alignment checks."
    );
  } else {
    lines.push(
      `Headmaster book snapshot (NZD, as of ${synthesis.asOf}):`,
      `- Total value: ${nzd(synthesis.totalValueNZD)} | P/L ${nzd(synthesis.totalGainNZD)} (${synthesis.totalGainPct.toFixed(2)}%)`,
      `- Cash: ${nzd(synthesis.cashBalanceNZD)}`,
      `- Diversification: ${synthesis.diversificationScore}/100 (${synthesis.concentrationLabel})`,
      "",
      "Allocation:"
    );
    synthesis.classAllocation.forEach((c) =>
      lines.push(`- ${c.label}: ${c.weight.toFixed(1)}% (${nzd(c.valueNZD)})`)
    );
    lines.push("", "Top positions:");
    synthesis.positions.slice(0, 8).forEach((p) =>
      lines.push(
        `- ${p.label} [${p.assetClass}] ${p.weight.toFixed(1)}% · ${nzd(p.valueNZD)}`
      )
    );
  }

  if (findings.contextBlock?.trim()) {
    lines.push("", "Latest Stox / Koins findings available to Headmaster:", findings.contextBlock.trim());
  }

  return lines.join("\n");
}

function buildAttachedReportsBlock(
  reports: z.infer<typeof attachedReportSchema>[]
): string {
  if (!reports.length) return "";
  const chunks = reports.map((r, i) => {
    const botLabel = r.bot === "crypto" ? "Koins" : r.bot === "stock" ? "Stox" : "Report";
    const when = r.generatedAt ? ` · ${r.generatedAt}` : "";
    const summary = (r.summary || "").trim() || "(No summary text provided.)";
    return `${i + 1}. **${botLabel}** — ${r.title}${when}\n${summary.slice(0, 4000)}`;
  });
  return ["Attached reports selected by the member:", ...chunks].join("\n\n");
}

/**
 * POST /api/portfolio-coach
 * Authenticated Portfolio Execution Coach chat.
 * Accepts optional Headmaster plan text + attached Stox/Koins report context.
 * Prefetches Headmaster synthesis when the member is entitled.
 */
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as unknown;
    const parsed = postSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const userMessage = parsed.data.message.trim();
    const history = parsed.data.history ?? [];
    const clientPlan = parsed.data.headmasterPlan?.trim() || "";
    const attached = parsed.data.attachedReports ?? [];

    let liveHeadmaster = "";
    if (isTotalumEntitled(user)) {
      try {
        const [synthesis, findings] = await Promise.all([
          loadTotalumSynthesis(user._id),
          loadReportFindings(user._id),
        ]);
        liveHeadmaster = buildHeadmasterContextBlock(synthesis, findings);
      } catch (err) {
        console.warn("[api/portfolio-coach] Headmaster prefetch failed:", err);
      }
    } else {
      liveHeadmaster =
        "Headmaster live synthesis: not available on this membership tier. " +
        "Continue with attached reports and dashboard execution coaching. " +
        "Mention Pro Headmaster access only if the member asks about planning tools.";
    }

    const contextParts = [
      `Member name: ${user.name}.`,
      liveHeadmaster,
      clientPlan
        ? `Additional Headmaster plan / strategy text from the client:\n${clientPlan}`
        : "",
      buildAttachedReportsBlock(attached),
    ].filter(Boolean);

    if (!isGrokConfigured()) {
      console.warn("[api/portfolio-coach] XAI_API_KEY missing — using fallback replies");
      return NextResponse.json({
        ok: true,
        data: { reply: portfolioCoachFallbackReply(userMessage), fallback: true },
      });
    }

    const messages: GrokMessage[] = [
      {
        role: "system",
        content: `${PORTFOLIO_COACH_SYSTEM_PROMPT}\n\nLive session context:\n${contextParts.join("\n\n")}`,
      },
      ...history.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      { role: "user", content: userMessage },
    ];

    try {
      const reply = await createGrokChatCompletion({
        messages,
        maxTokens: 750,
        temperature: 0.45,
      });
      return NextResponse.json({ ok: true, data: { reply } });
    } catch (aiErr) {
      console.error("[api/portfolio-coach] Grok call failed, using fallback:", aiErr);
      return NextResponse.json({
        ok: true,
        data: {
          reply: portfolioCoachFallbackReply(userMessage),
          fallback: true,
        },
      });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to reply";
    console.error("[api/portfolio-coach] POST error:", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
