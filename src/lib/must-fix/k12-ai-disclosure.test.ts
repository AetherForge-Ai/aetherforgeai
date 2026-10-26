import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { AI_REQUEST_LINES, AI_SENT_CATEGORIES } from "@/lib/public-copy";
import { AI_DISCLAIMER_DATA_SENTENCE, AI_PROVIDER_API_SENTENCE } from "@/lib/ai-provider-disclosure";

const lines = AI_REQUEST_LINES.join("\n");
const read = (rel: string) => readFileSync(rel, "utf8");

describe("K-12 AI disclosure", () => {
  it("says the Portfolio Notes Assistant saves messages (it writes chat_message)", () => {
    expect(lines).toContain("Messages in the assistant chat and the Portfolio Notes Assistant are saved to your account");
    expect(lines).not.toContain("The Portfolio Notes Assistant, the Headmaster chat");
    expect(read("src/lib/assistant-quota.server.ts")).toContain('createRecord("chat_message"');
  });

  it("lists the analysis report, free-trial briefing and site guide", () => {
    for (const route of ["/api/analysis", "/api/free-trial/run", "/api/personal-guide"] as const) {
      for (const c of AI_SENT_CATEGORIES[route]) expect(lines, `${route}: ${c}`).toContain(c);
    }
    expect(lines).toContain("We do not use any other AI provider.");
    expect(lines).toContain("We never send your email address, your name or your account ID");
  });

  it("uses default 30-day wording with no ZDR claim, model names or internal labels", () => {
    expect(AI_PROVIDER_API_SENTENCE).toContain("up to 30 days");
    expect(AI_PROVIDER_API_SENTENCE).toContain("https://docs.x.ai/developers/faq/security");
    const blob = `${lines}\n${AI_PROVIDER_API_SENTENCE}\n${AI_DISCLAIMER_DATA_SENTENCE}`;
    expect(blob).not.toMatch(/zero data retention|grok-\d|ULTRA|ZENITH|OpenAI|Claude|Gemini/i);
    expect(lines).not.toMatch(/\b(Grok|xAI)\b/);
    expect(AI_DISCLAIMER_DATA_SENTENCE).not.toMatch(/\b(Grok|xAI)\b/);
  });

  it("renders the data sentence in AI disclaimer section 3", () => {
    expect(read("src/app/ai-disclaimer/page.tsx")).toContain("{AI_PROVIDER_API_SENTENCE} {AI_DISCLAIMER_DATA_SENTENCE}");
  });
});
