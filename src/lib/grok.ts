import "server-only";

/**
 * Thin server-side client for the xAI (Grok) chat completions API.
 * xAI is OpenAI-compatible, so we speak the same request/response shape.
 *
 * Configure via env:
 *   XAI_API_KEY  — required, your xAI secret key (starts with "xai-")
 *   XAI_MODEL    — optional, defaults to "grok-4.6"
 */

import {
  ZENITH_MODEL_DEFAULT,
  ZENITH_SYSTEM_DIRECTIVE,
  ZENITH_TUNING,
} from "@/lib/zenith";

const XAI_ENDPOINT = "https://api.x.ai/v1/chat/completions";
const DEFAULT_MODEL = ZENITH_MODEL_DEFAULT;

/** An AI failure with a short, key-free reason code for logs and QA (b6 CR-2). */
export class GrokError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = "GrokError";
  }
}

/** Strip anything that looks like a key or bearer token before logging. */
export function redactSecrets(text: string): string {
  return text
    .replace(/xai-[A-Za-z0-9_-]+/g, "xai-[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]");
}

/** Reply text from a string or an array of content parts. */
export function completionText(content: unknown): string {
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((part) =>
        typeof part === "string" ? part : part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string" ? (part as { text: string }).text : ""
      )
      .join("")
      .trim();
  }
  return "";
}

/**
 * b6 CR-2: the public guide uses a fast non-reasoning model. The reasoning
 * default spent its token allowance thinking and returned no text inside the
 * 10 s budget, so every guide call fell back. XAI_GUIDE_MODEL overrides.
 */
export const GUIDE_MODEL_DEFAULT = "grok-4.20-0309-non-reasoning";
export function guideModel(): string {
  return process.env.XAI_GUIDE_MODEL?.trim() || GUIDE_MODEL_DEFAULT;
}

export interface GrokMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface GrokCompletionOptions {
  messages: GrokMessage[];
  maxTokens?: number;
  temperature?: number;
  model?: string;
  /** Abort the request (used for the 10 s public guide timeout). */
  signal?: AbortSignal;
  /** Token counts from the vendor response, for spend logging. */
  onUsage?: (usage: { promptTokens: number | null; completionTokens: number | null }) => void;
}

export function isGrokConfigured(): boolean {
  return !!process.env.XAI_API_KEY;
}

/** ZENITH State is available whenever the owner's Grok key is configured. */
export function isZenithConfigured(): boolean {
  return isGrokConfigured();
}

/**
 * Run a completion in SuperGrok 4.6 ULTRA ADVANCED ZENITH STATE.
 *
 * This is the single entry point every bot uses for its report narratives: it
 * prepends the ZENITH operating directive to the caller's messages, pins the
 * ZENITH model (grok-4.6 unless XAI_MODEL overrides) and applies deep, decisive
 * default tuning. Callers still pass their own task-specific system/user turns.
 */
export async function createZenithCompletion({
  messages,
  maxTokens,
  temperature,
}: {
  messages: GrokMessage[];
  maxTokens?: number;
  temperature?: number;
}): Promise<string> {
  const zenithMessages: GrokMessage[] = [
    { role: "system", content: ZENITH_SYSTEM_DIRECTIVE },
    ...messages,
  ];
  return createGrokChatCompletion({
    messages: zenithMessages,
    model: process.env.XAI_MODEL || ZENITH_MODEL_DEFAULT,
    maxTokens: maxTokens ?? ZENITH_TUNING.maxTokens,
    temperature: temperature ?? ZENITH_TUNING.temperature,
  });
}

/**
 * Calls Grok and returns the assistant's reply text.
 * Throws on missing config or a non-OK response so callers can surface the error
 * to the frontend (no silent failures).
 */
export async function createGrokChatCompletion({
  messages,
  maxTokens = 800,
  temperature = 0.7,
  model,
  signal,
  onUsage,
}: GrokCompletionOptions): Promise<string> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    throw new Error("XAI_API_KEY is not configured on the server.");
  }

  const resolvedModel = model || process.env.XAI_MODEL || DEFAULT_MODEL;

  console.log(`[grok] Requesting completion (model=${resolvedModel}, messages=${messages.length})`);

  const res = await fetch(XAI_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: resolvedModel,
      messages,
      max_tokens: maxTokens,
      temperature,
      stream: false,
    }),
    signal,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error(`[grok] API error ${res.status} (model=${resolvedModel}): ${redactSecrets(errText).slice(0, 300)}`);
    throw new GrokError("AI request failed. Try again in a moment.", `http_${res.status}`);
  }

  let json: {
    choices?: { message?: { content?: unknown }; finish_reason?: string }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  try {
    json = (await res.json()) as typeof json;
  } catch {
    console.error(`[grok] Unparseable response (model=${resolvedModel})`);
    throw new GrokError("AI returned an unreadable response.", "parse");
  }
  if (onUsage) {
    onUsage({
      promptTokens: typeof json?.usage?.prompt_tokens === "number" ? json.usage.prompt_tokens : null,
      completionTokens: typeof json?.usage?.completion_tokens === "number" ? json.usage.completion_tokens : null,
    });
  }

  const content = completionText(json?.choices?.[0]?.message?.content);
  if (!content) {
    const finish = json?.choices?.[0]?.finish_reason;
    console.error(
      `[grok] Empty completion payload (finish_reason=${finish ?? "none"}, max_tokens=${maxTokens}):`,
      redactSecrets(JSON.stringify(json)).slice(0, 500)
    );
    throw new GrokError("AI returned an empty response.", "empty");
  }

  return content;
}
