/**
 * Member-facing names for the three report bots, and a pass that drops model
 * branding from report text. Company names such as Advanced Micro Devices stay.
 */

const COMPANY_SHIELD = "\u0000AMD\u0000";

export function memberBotLabel(bot: "stock" | "crypto"): string {
  return bot === "crypto" ? "intelligent AI bot named Koins" : "intelligent AI bot named Stox";
}

export const HEADMASTER_BOT_LABEL = "intelligent AI bot named Headmaster";

export function stripReportModelLanguage(text: string): string {
  const shielded = text.replace(/Advanced Micro Devices(?:, Inc\.)?/g, COMPANY_SHIELD);
  const out = shielded
    .replace(/\bLive ZENITH run\b/gi, "Live report")
    .replace(/\bUltra Advanced ZENITH State\b/gi, "")
    .replace(/\bSuper\s*Grok(?:\s*\d+(?:\.\d+)?)?\b/gi, "")
    .replace(/\bgrok-\d+(?:\.\d+)?\b/gi, "")
    .replace(/\b(?:Grok|xAI|Claude|Gemini|OpenAI)\b/g, "")
    .replace(/\bGPT-\d+(?:\.\d+)?\b/gi, "")
    .replace(/\b(?:ULTRA|ZENITH|advanced)\b/gi, "")
    .replaceAll(COMPANY_SHIELD, "Advanced Micro Devices")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([,.;:])/g, "$1");
  return out;
}

function scrubDeep<T>(value: T): T {
  if (typeof value === "string") return stripReportModelLanguage(value) as T;
  if (Array.isArray(value)) return value.map((item) => scrubDeep(item)) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) out[key] = scrubDeep(item);
    return out as T;
  }
  return value;
}

export function labelMemberReport<
  T extends { bot: "stock" | "crypto"; isDemo: boolean; engine: string; generatedLabel: string },
>(report: T): T {
  const named = report.isDemo
    ? report
    : {
        ...report,
        engine: memberBotLabel(report.bot),
        generatedLabel: "Live report",
      };
  return scrubDeep(named);
}
