import { formatDisplayDateTime } from "@/lib/currency";
import { XAI_CHAT_ENDPOINT, guideModel, lastGuideFailure, xaiErrorSummary } from "@/lib/grok";

/**
 * Goal b8 CR-2 / K-10: a key-free health check of the AI guide provider for /status.
 * It lists the provider's models (no tokens spent) and reports only an HTTP
 * reason code, never the key or the provider's error text. Cached per isolate
 * for five minutes. When Lukas fixes the key, this turns OK and the guide
 * answers with no code change.
 */
// b25 CR-2: /status said "OK" from /v1/models while every guide call got http_404. The probe now
// makes the guide's own call: same endpoint (chat/completions), same model, one output token.
export const AI_HEALTH_TTL_MS = 5 * 60 * 1000;

export type AiProviderHealth =
  | { state: "ok"; checkedAt: string; model?: string }
  | { state: "unavailable"; code: string; checkedAt: string; model?: string; endpoint?: string; providerCode?: string }
  | { state: "not_configured"; checkedAt: string };

let cached: { at: number; value: AiProviderHealth } | null = null;

export function resetAiProviderHealth(): void {
  cached = null;
}

export async function aiProviderHealth(
  fetchImpl: typeof fetch = fetch,
  now = Date.now(),
  apiKey = process.env.XAI_API_KEY
): Promise<AiProviderHealth> {
  if (cached && now - cached.at < AI_HEALTH_TTL_MS) return cached.value;
  const checkedAt = new Date(now).toISOString();
  let value: AiProviderHealth;
  if (!apiKey) {
    value = { state: "not_configured", checkedAt };
  } else {
    try {
      const model = guideModel();
      const res = await fetchImpl(XAI_CHAT_ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "ping" }], max_tokens: 1, stream: false }),
        signal: AbortSignal.timeout(6000),
      });
      // b27 CR-2: read the provider's error code from the body (never the key) for /status.
      const errBody = res.ok ? null : xaiErrorSummary(res.status, await res.text().catch(() => ""));
      value = res.ok
        ? { state: "ok", checkedAt, model }
        : { state: "unavailable", code: `http_${res.status}`, checkedAt, model, endpoint: XAI_CHAT_ENDPOINT, providerCode: errBody?.code || undefined };
      if (errBody) console.warn(`[ai-health] guide probe failed model=${model} endpoint=${XAI_CHAT_ENDPOINT} status=${errBody.status} error.code=${errBody.code || "-"} error.message=${errBody.message || "-"}`);
    } catch (err) {
      const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
      value = { state: "unavailable", code: timedOut ? "timeout" : "network", checkedAt };
    }
  }
  cached = { at: now, value };
  return value;
}

/** One line for /status. No secrets and no provider error text. */
export function aiProviderStatusLine(h: AiProviderHealth): { body: string; tone?: "amber" } {
  const when = `${formatDisplayDateTime(h.checkedAt)} (NZ time)`;
  const fail = lastGuideFailure();
  const lastFail = fail ? ` Last guide failure: ${fail.code} (model ${fail.model}) at ${formatDisplayDateTime(fail.at)} (NZ time).` : "";
  if (h.state === "ok") return { body: `OK${h.model ? ` (model ${h.model})` : ""}, checked ${when}.${lastFail}`, ...(fail ? { tone: "amber" as const } : {}) };
  if (h.state === "not_configured") return { body: `Not configured, checked ${when}. The guide answers from built-in help.`, tone: "amber" };
  const where = h.model ? ` from model ${h.model} at ${h.endpoint ?? XAI_CHAT_ENDPOINT}` : "";
  const provider = (h as { providerCode?: string }).providerCode ? `; provider error code ${(h as { providerCode?: string }).providerCode}` : "";
  return { body: `Unavailable (${h.code})${where}${provider}, checked ${when}. The guide answers from built-in help until this is fixed.${lastFail}`, tone: "amber" };
}
