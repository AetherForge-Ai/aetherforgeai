import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BOT_GUIDES, guideWordCount } from "@/lib/bot-guides";

function read(rel: string) {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

describe("bot guides", () => {
  it("gives each bot page 600 words, two alts, and an example book", () => {
    for (const text of Object.values(BOT_GUIDES)) {
      expect(guideWordCount(text)).toBeGreaterThanOrEqual(600);
    }
    const taxWord = ["G", "ST"].join("");
    const blob = Object.values(BOT_GUIDES).join("\n") + read("src/components/public/BotGuide.tsx");
    expect(blob).not.toContain(taxWord);
    expect(blob).not.toMatch(/\b(SuperGrok|Grok|xAI|Claude|Gemini|GPT-\d|ZENITH|ULTRA)\b/);
    expect(blob).not.toMatch(/\breal-time\b|\bofficial\b/i);
    expect(blob).toContain("Example. Not a member book.");
    expect(blob).toContain("EXAMPLE.NZ");

    for (const rel of ["src/app/stox/page.tsx", "src/app/koins/page.tsx", "src/app/smitty/page.tsx", "src/app/headmaster/page.tsx"]) {
      const page = read(rel);
      expect(page).toContain("BotGuide");
      expect(page.match(/alt:/g)?.length).toBeGreaterThanOrEqual(2);
    }
    expect(read("src/lib/bot-guides.ts")).toContain("pull-check:batch2-2026-10-11 B2-10");
  });
});