/**
 * G-26 (b81): privacy-forward AI mode. Per member: "on" (default), "redacted" (amounts and share
 * counts are replaced before anything is sent to the AI provider; tickers and percentages stay) or
 * "off" (no AI call is made for that member; fixed replies only). Behind AI_PRIVACY_MODE (off unless "1").
 */
export type AiPrivacyMode = "on" | "redacted" | "off";

export const AI_PRIVACY_TICKER = "AF-AIPV";

export const aiPrivacyModeEnabled = (env: Record<string, string | undefined> = process.env) =>
  env.AI_PRIVACY_MODE === "1";

export function parseAiPrivacyMode(value: unknown): AiPrivacyMode {
  return value === "off" || value === "redacted" ? value : "on";
}

export const AI_OFF_REPLY =
  "AI is turned off for your account, so nothing was sent to the AI provider. You can turn it back on in Settings, under AI and privacy.";

export const AI_PRIVACY_LABELS: Record<AiPrivacyMode, string> = {
  on: "On: AI notes can use your holdings, amounts and share counts.",
  redacted: "Hide amounts: AI notes see tickers, weights and percentages only. Dollar amounts and share counts are removed before sending.",
  off: "Off: no AI requests are made for your account.",
};

const MONEY = /-?(?:NZ|US|AU|A)?\$\s?-?\d[\d,]*(?:\.\d+)?(?:\s?[kKmMbB]\b)?/g;
const SHARES = /\b\d[\d,]*(?:\.\d+)?(\s+(?:shares?|units?|coins?))\b/gi;
const LABELLED = /\b(value|cost|cash|price|avg|now|P\/L|total[^:\n]{0,30})(:?\s+)(-?\d[\d,]*(?:\.\d+)?)(?!\s?%)/gi;

/** Removes money amounts and quantities. Percentages, tickers and names are kept. */
export function redactHoldingsText(text: string): string {
  return text
    .replace(MONEY, "[amount hidden]")
    .replace(SHARES, "[qty hidden]$1")
    .replace(LABELLED, (_m, label: string, gap: string) => `${label}${gap}[amount hidden]`);
}

type Msg = { role: "system" | "user" | "assistant"; content: string };

/**
 * Applies the member's mode to an outgoing request. Returns null when AI is off (the caller must not call
 * the provider). In "redacted" mode every message except the member's own latest question is redacted.
 */
export function applyAiPrivacy<T extends Msg>(messages: T[], mode: AiPrivacyMode): T[] | null {
  if (mode === "off") return null;
  if (mode === "on") return messages;
  const lastUser = messages.map((m) => m.role).lastIndexOf("user");
  return messages.map((m, i) => (i === lastUser && m.role === "user" && !/PORTFOLIO|HOLDINGS|SNAPSHOT/.test(m.content) ? m : { ...m, content: redactHoldingsText(m.content) }));
}
