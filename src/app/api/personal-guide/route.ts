import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createGrokChatCompletion,
  GrokError,
  guideModel,
  GUIDE_MODEL_FALLBACK,
  noteGuideFailure,
  isGrokConfigured,
  type GrokMessage,
} from "@/lib/grok";
import {
  PERSONAL_GUIDE_LIMIT,
  PERSONAL_GUIDE_WINDOW_MS,
  PUBLIC_INPUT_CAP,
  RATE_LIMIT_ADDRESS_REQUIRED,
  rateLimitHeaders,
  rateLimitIdentity,
  ipBucket48,
  PERSONAL_GUIDE_LIMIT_48,
  takeRateLimit,
  takeSlidingRateLimit,
} from "@/lib/ip-rate-limit";
import {
  PERSONAL_GUIDE_SYSTEM_PROMPT,
  personalGuideFallbackReply,
} from "@/lib/personal-guide-knowledge";
import { ensureDurableRateLimit } from "@/lib/durable-counter.server";
import {
  aiSpendLogLine,
  anonAiDailyBudget,
  crossesSpendAlert,
  GENERAL_INFORMATION_REPLY,
  GUIDE_BUSY_MESSAGE,
  GUIDE_INJECTION_RULES,
  GUIDE_MAX_TOKENS,
  GUIDE_SESSION_LIMIT,
  GUIDE_SESSION_WINDOW_MS,
  GUIDE_TIMEOUT_MS,
  isPersonalisedAdviceRequest,
  nzDayKey,
  sanitizeGuideReply,
  withGuideDisclaimer,
} from "@/lib/guide-safety";

ensureDurableRateLimit();

export const dynamic = "force-dynamic";

const postSchema = z.object({
  message: z.string().min(1, "Message is required").max(PUBLIC_INPUT_CAP),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(PUBLIC_INPUT_CAP),
      })
    )
    .max(10)
    .optional(),
  sessionId: z.string().max(64).regex(/^[A-Za-z0-9-]*$/).optional(),
});

/**
 * Public lead-capture chat for the homepage Personal Guide.
 * No auth required — keep payloads small and never persist PII server-side.
 */
export async function POST(req: Request) {
  try {
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
    const identity = rateLimitIdentity(req);
    if (!identity.ok) {
      return NextResponse.json({ ok: false, error: RATE_LIMIT_ADDRESS_REQUIRED }, { status: 400 });
    }
    // b25 CR-2: sliding 60 s window on the durable table (keyed per /64 by rateLimitIdentity).
    const limit = await takeSlidingRateLimit(
      `personal-guide:${encodeURIComponent(identity.ip)}`,
      PERSONAL_GUIDE_LIMIT,
      PERSONAL_GUIDE_WINDOW_MS,
      Date.now(),
      { edge: "GUIDE_RATE_LIMITER" }
    );
    // Goal b11 CR-2: a wider /48 bucket catches rotation across /64s.
    const raw48 = ipBucket48(req.headers.get("cf-connecting-ip") || "");
    const wide = raw48
      ? await takeRateLimit(`personal-guide48:${encodeURIComponent(raw48)}`, PERSONAL_GUIDE_LIMIT_48, PERSONAL_GUIDE_WINDOW_MS, Date.now(), { edge: "GUIDE48_RATE_LIMITER" })
      : null;
    if ((wide && !wide.allowed) || !limit.allowed) {
      // Goal b12 CR-2: log only the hashed bucket, never the address.
      console.info("[rate-limit] personal-guide refused", { key: limit.keyHash, key48: wide?.keyHash ?? null, store: (wide && !wide.allowed ? wide : limit).store });
    }
    if (wide && !wide.allowed) {
      return NextResponse.json(
        { ok: false, error: "That is enough messages for now. Try again in a minute.", limited: true },
        { status: 429, headers: rateLimitHeaders(wide, true) }
      );
    }
    if (!limit.allowed) {
      return NextResponse.json(
        {
          ok: false,
          error: "That is enough messages for now. Try again in a minute.",
          limited: true,
        },
        { status: 429, headers: rateLimitHeaders(limit, true) }
      );
    }

    const sessionId = parsed.data.sessionId?.trim();
    if (sessionId) {
      const sessionLimit = await takeRateLimit(
        `personal-guide-session:${sessionId}`,
        GUIDE_SESSION_LIMIT,
        GUIDE_SESSION_WINDOW_MS
      );
      if (!sessionLimit.allowed) {
        return NextResponse.json(
          { ok: false, error: "That is enough messages for this chat. Try again later.", limited: true },
          { status: 429, headers: rateLimitHeaders(sessionLimit, true) }
        );
      }
    }

    const canned = (reply: string, extra: Record<string, unknown> = {}) =>
      NextResponse.json(
        { ok: true, data: { reply: withGuideDisclaimer(reply), fallback: true, ...extra } },
        { headers: rateLimitHeaders(limit) }
      );

    // A request for a personal pick never reaches the model.
    if (isPersonalisedAdviceRequest(userMessage)) {
      return canned(GENERAL_INFORMATION_REPLY, { refused: "personalised_advice" });
    }

    if (!isGrokConfigured()) {
      console.warn("[api/personal-guide] AI key missing — using fallback replies");
      return canned(personalGuideFallbackReply(userMessage));
    }

    // Global daily budget for anonymous AI calls (NZ day). Over budget → canned reply.
    const budget = anonAiDailyBudget();
    const day = await takeRateLimit(`ai-anon-budget:${nzDayKey()}`, budget, 24 * 60 * 60 * 1000);
    const dayCount = budget - day.remaining;
    if (!day.allowed) {
      console.warn(aiSpendLogLine({ route: "personal-guide", estimated: true, dayCount: budget + 1, budget }));
      return canned(personalGuideFallbackReply(userMessage), { budget: "exhausted" });
    }
    if (crossesSpendAlert(dayCount, budget)) {
      console.error(`[ai-spend-alert] anonymous guide reached ${dayCount} of ${budget} calls today`);
    }

    const messages: GrokMessage[] = [
      { role: "system", content: `${PERSONAL_GUIDE_SYSTEM_PROMPT}\n\n${GUIDE_INJECTION_RULES}` },
      ...history.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      { role: "user", content: userMessage },
    ];

    let usage: { promptTokens: number | null; completionTokens: number | null } | null = null;
    let reply: string;
    const callGuide = (model: string) =>
      createGrokChatCompletion({
        messages,
        model,
        // b5 CR-2: 280 was too small for the reasoning model — its thinking used the
        // whole allowance and the API returned no reply text, so every call failed.
        maxTokens: GUIDE_MAX_TOKENS,
        temperature: 0.65,
        signal: AbortSignal.timeout(GUIDE_TIMEOUT_MS),
        onUsage: (u) => {
          usage = u;
        },
      });
    try {
      try {
        reply = await callGuide(guideModel());
      } catch (first) {
        // b25 CR-2: a 404 means the model id is wrong or retired. Note it (model + endpoint,
        // never the key) and try one current model from docs.x.ai before falling back.
        if (first instanceof GrokError && first.code === "http_404" && guideModel() !== GUIDE_MODEL_FALLBACK) {
          noteGuideFailure(guideModel(), "http_404");
          reply = await callGuide(GUIDE_MODEL_FALLBACK);
        } else {
          throw first;
        }
      }
    } catch (err) {
      const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
      const code = timedOut ? "timeout" : err instanceof GrokError ? err.code : "error";
      // Key-free: only the model id and a short reason code.
      console.warn(`[api/personal-guide] AI call failed model=${guideModel()} reason=${code}`);
      if (!timedOut) noteGuideFailure(guideModel(), code);
      if (timedOut) {
        return NextResponse.json(
          { ok: false, error: GUIDE_BUSY_MESSAGE, busy: true },
          { status: 503, headers: { ...rateLimitHeaders(limit), "Retry-After": "10" } }
        );
      }
      // b5 CR-2: a vendor error or an empty reply is not "busy". Answer from the
      // built-in guide so the visitor still gets help (and the limiter still counts).
      return canned(personalGuideFallbackReply(userMessage), { reason: "ai_unavailable", code });
    }
    const used = usage as { promptTokens: number | null; completionTokens: number | null } | null;
    console.info(
      aiSpendLogLine({
        route: "personal-guide",
        promptTokens: used?.promptTokens ?? null,
        completionTokens: used?.completionTokens ?? null,
        estimated: !used,
        dayCount,
        budget,
      })
    );

    return NextResponse.json(
      { ok: true, data: { reply: sanitizeGuideReply(reply) } },
      { headers: rateLimitHeaders(limit) }
    );
  } catch (err: unknown) {
    console.error("[api/personal-guide] POST error:", err);
    return NextResponse.json({ ok: false, error: GUIDE_BUSY_MESSAGE }, { status: 500 });
  }
}
