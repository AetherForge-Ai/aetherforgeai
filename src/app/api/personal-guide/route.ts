import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createGrokChatCompletion,
  isGrokConfigured,
  type GrokMessage,
} from "@/lib/grok";
import {
  PERSONAL_GUIDE_LIMIT,
  PUBLIC_INPUT_CAP,
  RATE_LIMIT_ADDRESS_REQUIRED,
  RATE_WINDOW_MS,
  rateLimitIdentity,
  takeRateLimit,
} from "@/lib/ip-rate-limit";
import {
  PERSONAL_GUIDE_SYSTEM_PROMPT,
  personalGuideFallbackReply,
} from "@/lib/personal-guide-knowledge";

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
    const limit = await takeRateLimit(
      `personal-guide:${encodeURIComponent(identity.ip)}`,
      PERSONAL_GUIDE_LIMIT,
      RATE_WINDOW_MS
    );
    if (!limit.allowed) {
      return NextResponse.json({
        ok: true,
        data: { reply: personalGuideFallbackReply(userMessage), fallback: true, limited: true },
      });
    }

    if (!isGrokConfigured()) {
      console.warn("[api/personal-guide] XAI_API_KEY missing — using fallback replies");
      return NextResponse.json({
        ok: true,
        data: { reply: personalGuideFallbackReply(userMessage), fallback: true },
      });
    }

    const messages: GrokMessage[] = [
      { role: "system", content: PERSONAL_GUIDE_SYSTEM_PROMPT },
      ...history.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      { role: "user", content: userMessage },
    ];

    const reply = await createGrokChatCompletion({
      messages,
      maxTokens: 280,
      temperature: 0.65,
    });

    return NextResponse.json({ ok: true, data: { reply } });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to reply";
    console.error("[api/personal-guide] POST error:", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
