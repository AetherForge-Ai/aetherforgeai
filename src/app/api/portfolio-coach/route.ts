import { withAssistantDisclaimer } from "@/lib/guide-safety";
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
import { isTotalumEntitled } from "@/lib/headmaster-access";
import { loadTotalumSynthesis, loadReportFindings } from "@/lib/totalum-service";
import { scopeHeadmasterIdeas } from "@/lib/headmaster-trust";
import { portfolioCoachCompletionMessages } from "@/lib/ai-request-payload";
import { ASSISTANT_SHARE_PICK_REPLY, isSharePickRequest, withGuideDisclaimer } from "@/lib/guide-safety";
import { keepAlive } from "@/lib/keep-alive.server";
import { coachStaticFactReply } from "@/lib/portfolio-coach-knowledge";
import { readAssistantQuota, recordAssistantExchange, type AssistantQuota } from "@/lib/assistant-quota.server";

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
      "Coach the member to add holdings or cash in the Transaction Centre before alignment checks."
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
  const held = synthesis.positions
    .filter((p) => p.assetClass !== "cash")
    .map((p) => p.label);
  const scoped = scopeHeadmasterIdeas(findings.ideas || [], held, false);
  lines.push("", scoped.contextBlock);

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
 * Authenticated Portfolio Notes Assistant chat. Route id stays portfolio-coach.
 * Accepts optional Headmaster plan text + attached Stox/Koins report context.
 * Prefetches Headmaster synthesis when the member is entitled.
 */
/** b31 CR-2: context and quota reads wait at most this long. */
const COACH_READ_TIMEOUT_MS = 1_500;
/** b31 CR-2: the model gets this long, so a factual answer returns within 10 s. */
const COACH_MODEL_TIMEOUT_MS = 7_000;

function boundedRead<T>(work: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([work.catch(() => null), new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))]);
}

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

    // b28 L-4: the panel shares the Market Assistant quota with /api/chat.
    // b31 CR-2: every slow read is bounded; a timed-out quota read does not block the answer.
    const quota =
      (await boundedRead(readAssistantQuota(user), COACH_READ_TIMEOUT_MS)) ??
      ({ used: 0, limit: null, remaining: null } as AssistantQuota);
    if (quota.limit != null && quota.used >= quota.limit) {
      return NextResponse.json(
        { ok: false, error: `You've used this month's ${quota.limit} Market Assistant queries.`, ...quota },
        { status: 429 }
      );
    }
    const answer = async (raw: string, extra: Record<string, unknown> = {}, count = true) => {
      const reply = withAssistantDisclaimer(raw);
      // b31 CR-2: the exchange is stored in the background; a timed-out model call is not counted.
      const after: AssistantQuota = count
        ? { used: quota.used + 1, limit: quota.limit, remaining: quota.limit == null ? null : Math.max(0, quota.limit - quota.used - 1) }
        : quota;
      if (count) {
        void keepAlive(
          recordAssistantExchange(user, quota, userMessage, reply).catch((err) => {
            console.warn("[api/portfolio-coach] quota record failed:", err instanceof Error ? err.message : "error");
          })
        );
      }
      return NextResponse.json({ ok: true, data: { reply, ...extra, used: after.used, limit: after.limit, remaining: after.remaining } });
    };

    // b28 CR-2: this is the route the signed-in Assistant panel calls. Share-pick questions are
    // refused here, before any context load, model call or built-in fallback (the fallback
    // answered "Which NZX share should I buy?" with how-to-buy steps while the model 404s).
    if (isSharePickRequest(userMessage)) {
      console.info(`[api/portfolio-coach] share-pick refusal for user ${user._id}`);
      return answer(withGuideDisclaimer(ASSISTANT_SHARE_PICK_REPLY), { refused: "personalised_advice", fallback: true });
    }
    const staticFact = coachStaticFactReply(userMessage);
    if (staticFact) return answer(staticFact, { facts: "static" });
    const clientPlan = parsed.data.headmasterPlan?.trim() || "";
    const attached = parsed.data.attachedReports ?? [];

    let liveHeadmaster = "";
    if (isTotalumEntitled(user)) {
      try {
        const [synthesis, findings] = await Promise.all([
          boundedRead(loadTotalumSynthesis(user._id), COACH_READ_TIMEOUT_MS),
          boundedRead(loadReportFindings(user._id), COACH_READ_TIMEOUT_MS),
        ]);
        liveHeadmaster = synthesis || findings ? buildHeadmasterContextBlock(synthesis as never, (findings ?? []) as never) : "";
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
      liveHeadmaster,
      clientPlan
        ? `Additional Headmaster plan / strategy text from the client:\n${clientPlan}`
        : "",
      buildAttachedReportsBlock(attached),
    ].filter(Boolean);

    if (!isGrokConfigured()) {
      console.warn("[api/portfolio-coach] XAI_API_KEY missing — using fallback replies");
      return answer(portfolioCoachFallbackReply(userMessage), { fallback: true });
    }

    const messages: GrokMessage[] = portfolioCoachCompletionMessages({
      systemPrompt: PORTFOLIO_COACH_SYSTEM_PROMPT,
      context: contextParts.join("\n\n"),
      history: history.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      userMessage,
    });

    try {
      const reply = await createGrokChatCompletion({
        messages,
        maxTokens: 600,
        temperature: 0.45,
        signal: AbortSignal.timeout(COACH_MODEL_TIMEOUT_MS),
      });
      return answer(reply);
    } catch (aiErr) {
      const timedOut = aiErr instanceof Error && (aiErr.name === "TimeoutError" || aiErr.name === "AbortError");
      console.error("[api/portfolio-coach] model call failed, using fallback:", timedOut ? "timeout" : aiErr);
      return answer(portfolioCoachFallbackReply(userMessage), { fallback: true, ...(timedOut ? { timedOut: true } : {}) }, !timedOut);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to reply";
    console.error("[api/portfolio-coach] POST error:", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
