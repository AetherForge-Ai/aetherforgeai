import { formatDisplayDateTime } from "@/lib/currency";

/**
 * Goal b8 CR-2 / K-10: a key-free health check of the AI guide provider for /status.
 * It lists the provider's models (no tokens spent) and reports only an HTTP
 * reason code, never the key or the provider's error text. Cached per isolate
 * for five minutes. When Lukas fixes the key, this turns OK and the guide
 * answers with no code change.
 */
const MODELS_ENDPOINT = "https://api.x.ai/v1/models";
export const AI_HEALTH_TTL_MS = 5 * 60 * 1000;

export type AiProviderHealth =
  | { state: "ok"; checkedAt: string }
  | { state: "unavailable"; code: string; checkedAt: string }
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
      const res = await fetchImpl(MODELS_ENDPOINT, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(4000),
      });
      value = res.ok ? { state: "ok", checkedAt } : { state: "unavailable", code: `http_${res.status}`, checkedAt };
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
  if (h.state === "ok") return { body: `OK, checked ${when}` };
  if (h.state === "not_configured") return { body: `Not configured, checked ${when}. The guide answers from built-in help.`, tone: "amber" };
  return { body: `Unavailable (${h.code}), checked ${when}. The guide answers from built-in help until this is fixed.`, tone: "amber" };
}
