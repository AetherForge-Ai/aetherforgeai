import { describe, it, expect } from "vitest";
import { BOT_EXAMPLES, BOT_GUIDE_PARAGRAPHS, BOT_GUIDES } from "@/lib/bot-guides";

describe("TT fresh H7 — bot pages", () => {
  it("Stox example has no coin, Koins no share, Smitty a metal", () => {
    expect(JSON.stringify(BOT_EXAMPLES.stox)).not.toMatch(/COIN/);
    expect(JSON.stringify(BOT_EXAMPLES.koins)).not.toMatch(/\.NZ/);
    expect(BOT_EXAMPLES.smitty.rows[0].name).toMatch(/Gold/);
  });
  it("examples are distinct per bot", () => {
    const reports = Object.values(BOT_EXAMPLES).map((e) => e.report);
    expect(new Set(reports).size).toBe(4);
  });
  it("paragraphs join to the same guide text", () => {
    expect(BOT_GUIDE_PARAGRAPHS.stox.join(" ")).toBe(BOT_GUIDES.stox);
  });
});
