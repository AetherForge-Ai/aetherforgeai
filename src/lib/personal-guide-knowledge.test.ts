import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  PERSONAL_GUIDE_SIGNUP_URL,
  PERSONAL_GUIDE_SYSTEM_PROMPT,
  personalGuideFallbackReply,
} from "@/lib/personal-guide-knowledge";

function read(rel: string) {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

function words(text: string) {
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_`#>]/g, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function hasBulletDump(text: string) {
  return text.split("\n").some((line) => /^\s*(?:[-*]|\d+\.)\s+/.test(line));
}

const MODEL_NAME = /\b(SuperGrok|Grok|xAI|grok-4(?:\.\d+)?|ZENITH|ULTRA)\b/i;

describe("signup help replies stay short", () => {
  const prompts = [
    "Explain how AetherForge works in two or three short sentences.",
    "What do Stox, Koins, and The Headmaster do?",
    "I'm unsure how to buy stocks or crypto.",
    "What is the single first step on the free plan?",
    "How do I start free?",
    "What is the Dow Jones?",
    "What is an index?",
    "How can I buy shares in NZ?",
    "Where do people trade crypto?",
    "How do I buy bitcoin in NZ?",
    "Tell me about gold",
    "Hello",
  ];

  it("keeps a default reply to one idea, with a signup link and no bullet dump", () => {
    for (const prompt of prompts) {
      const reply = personalGuideFallbackReply(prompt);
      const count = words(reply).length;
      expect(count, `${prompt} (${count} words)\n${reply}`).toBeLessThanOrEqual(80);
      expect(reply, prompt).toContain(PERSONAL_GUIDE_SIGNUP_URL);
      expect(hasBulletDump(reply), prompt).toBe(false);
      expect(reply, prompt).not.toMatch(MODEL_NAME);
    }
  });

  it("uses a short list only when the visitor asks for detail", () => {
    const reply = personalGuideFallbackReply(
      "List the broker options. How can I buy shares?"
    );
    expect(hasBulletDump(reply)).toBe(true);
    expect(reply).toContain("Sharesies");
    expect(words(reply).length).toBeLessThanOrEqual(120);
    expect(reply).toContain(PERSONAL_GUIDE_SIGNUP_URL);
  });

  it("does not mention brokers until the visitor asks how to buy", () => {
    const casual = personalGuideFallbackReply("How does AetherForge work?");
    expect(casual).not.toMatch(/Sharesies|Binance|Tiger Brokers|Coinbase/);
    const asked = personalGuideFallbackReply("How can I buy shares?");
    expect(asked).toMatch(/Sharesies/);
    expect(asked).not.toMatch(/you should open/i);
  });

  it("tells the model to stay short and say AI only", () => {
    expect(PERSONAL_GUIDE_SYSTEM_PROMPT).toContain("40–70 words");
    expect(PERSONAL_GUIDE_SYSTEM_PROMPT).toContain("No bullet or numbered list");
    expect(PERSONAL_GUIDE_SYSTEM_PROMPT).toContain("say only that you are AI");
    expect(PERSONAL_GUIDE_SYSTEM_PROMPT).not.toMatch(MODEL_NAME);
    expect(PERSONAL_GUIDE_SYSTEM_PROMPT).not.toContain("Prefer bullets");
    expect(PERSONAL_GUIDE_SYSTEM_PROMPT).toContain("no Smitty report");
    expect(read("src/app/api/personal-guide/route.ts")).toContain("maxTokens: 280");
  });

  it("opens the help panel with short topics instead of stacked card copy", () => {
    const chat = read("src/components/personal-guide/PersonalGuideChat.tsx");
    expect(chat).toContain("Pick a topic, or ask a short question.");
    expect(chat).toContain('title: "Start free"');
    expect(chat).toContain('title: "How it works"');
    expect(chat).not.toContain("Don't understand how AetherForgeAI works?");
    expect(chat).not.toContain("Professional site help");
    expect(chat).not.toContain("Get Started Now Free");
    expect(chat).toContain("Educational only · not advice");
    expect(chat).toContain("Start free →");
  });
});
