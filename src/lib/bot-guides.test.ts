import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BOT_GUIDES, BOT_PAGE_DISCLAIMER, BOT_PAGE_NOTES } from "@/lib/bot-guides";

function read(rel: string) {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

describe("bot guides", () => {
  it("gives each bot page its own list, one shared disclaimer, one or more alts, and an example book", () => {
    expect(BOT_GUIDES.stox).toContain("NZX");
    expect(BOT_GUIDES.stox).toContain("ASX");
    expect(BOT_GUIDES.koins).toContain("Crypto projections stay paused");
    expect(BOT_GUIDES.headmaster).toContain("planning bot");
    expect(BOT_GUIDES.smitty).toContain("gold and silver");
    // b5 M-3: the feed caveat is Stox's own note; the shared line is positioning only.
    expect(BOT_PAGE_NOTES.stox).toContain("not a direct NZX or ASX feed");
    const taxWord = ["G", "ST"].join("");
    const blob = Object.values(BOT_GUIDES).join("\n") + BOT_PAGE_DISCLAIMER + Object.values(BOT_PAGE_NOTES).join("\n") + read("src/components/public/BotGuide.tsx");
    expect(blob).not.toContain("does not name the model");
    expect(read("src/components/public/BotGuide.tsx")).toContain("BOT_PAGE_NOTES[kind]");
    expect(blob).not.toContain(taxWord);
    expect(blob).not.toMatch(/\b(SuperGrok|Grok|xAI|Claude|Gemini|GPT-\d|ZENITH|ULTRA)\b/);
    expect(blob).not.toMatch(/\breal-time\b|\bofficial\b/i);
    expect(blob).toContain("Example. Not a member book.");
    expect(read("src/lib/bot-guides.ts")).toContain("EXAMPLE.NZ");

    for (const rel of ["src/app/stox/page.tsx", "src/app/koins/page.tsx", "src/app/smitty/page.tsx", "src/app/headmaster/page.tsx"]) {
      const page = read(rel);
      expect(page).toContain("BotGuide");
      // b6 M-3: one transparent cut-out per page (the masked square art is gone).
      expect(page.match(/alt:/g)?.length).toBeGreaterThanOrEqual(1);
    }
    expect(read("src/lib/bot-guides.ts")).toContain("pull-check:batch2-2026-10-11 B2-10");
  });
});