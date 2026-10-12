import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  assistantCompletionMessages,
  headmasterCompletionMessages,
  portfolioCoachCompletionMessages,
  tickerNoteCompletionMessages,
} from "@/lib/ai-request-payload";

function read(rel: string) {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

const ACCOUNT_NAME = "Zelda Quillworth";
const ACCOUNT_EMAIL = "zelda.quillworth@example.com";

function payloadOf(messages: { content: string }[]): string {
  return JSON.stringify(messages);
}

describe("outbound AI payloads omit the account name and email", () => {
  const history = [{ role: "user" as const, content: "What does this holding weigh?" }];

  it("builds the four completion requests without a name or an email", () => {
    const payloads = [
      assistantCompletionMessages({
        systemPrompt: "You are AI.",
        bookLine: "The book is empty.",
        history,
      }),
      portfolioCoachCompletionMessages({
        systemPrompt: "You are the Portfolio Notes Assistant.",
        context: "Cash balance NZ$10.",
        history,
        userMessage: "Explain the cash line.",
      }),
      headmasterCompletionMessages({
        systemPrompt: "You are the Headmaster.",
        context: "Total value NZ$10.",
        history,
        userMessage: "Explain the total.",
      }),
      tickerNoteCompletionMessages({
        systemPrompt: "You are AI.",
        symbol: "FPH",
        securityName: "Fisher & Paykel Healthcare",
        liveContext: "Live quote for Fisher & Paykel Healthcare (FPH): price 30 NZD.",
        question: "Describe the quote.",
      }),
    ];
    for (const messages of payloads) {
      const blob = payloadOf(messages);
      expect(blob).not.toContain(ACCOUNT_NAME);
      expect(blob).not.toContain(ACCOUNT_EMAIL);
      expect(blob).toContain("Hello.");
      expect(blob).not.toMatch(/user's name|member's name|Member name/i);
    }
  });

  it("does not interpolate the account name or email in the four route builders", () => {
    for (const rel of [
      "src/app/api/chat/route.ts",
      "src/app/api/portfolio-coach/route.ts",
      "src/app/api/totalum/chat/route.ts",
      "src/app/api/ticker-analysis/route.ts",
    ]) {
      const source = read(rel);
      expect(source, rel).not.toContain("user.name");
      expect(source, rel).not.toContain("user.email");
      expect(source, rel).toMatch(/CompletionMessages/);
    }
  });
});
