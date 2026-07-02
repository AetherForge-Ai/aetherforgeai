import "server-only";

/**
 * Thin server-side client for the xAI (Grok) chat completions API.
 * xAI is OpenAI-compatible, so we speak the same request/response shape.
 *
 * Configure via env:
 *   XAI_API_KEY  — required, your xAI secret key (starts with "xai-")
 *   XAI_MODEL    — optional, defaults to "grok-4.3"
 */

const XAI_ENDPOINT = "https://api.x.ai/v1/chat/completions";
const DEFAULT_MODEL = "grok-4.3";

export interface GrokMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface GrokCompletionOptions {
  messages: GrokMessage[];
  maxTokens?: number;
  temperature?: number;
  model?: string;
}

export function isGrokConfigured(): boolean {
  return !!process.env.XAI_API_KEY;
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
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error(`[grok] API error ${res.status}: ${errText}`);
    throw new Error(`Grok API error (${res.status}): ${errText || res.statusText}`);
  }

  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };

  const content = json?.choices?.[0]?.message?.content?.trim();
  if (!content) {
    console.error("[grok] Empty completion payload:", JSON.stringify(json).slice(0, 500));
    throw new Error("Grok returned an empty response.");
  }

  return content;
}
