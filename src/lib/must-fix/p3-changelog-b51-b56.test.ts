import { describe, expect, it } from "vitest";
import { CHANGELOG_ENTRIES } from "@/lib/changelog-entries";

describe("P3: changelog covers 20–22 Oct releases in plain language", () => {
  it("newest entry is 22 Oct and 20–22 Oct are present", () => {
    expect(CHANGELOG_ENTRIES[0].title).toMatch(/^22 Oct 2026/);
    for (const d of ["22 Oct 2026", "21 Oct 2026", "20 Oct 2026"]) expect(CHANGELOG_ENTRIES.some((e) => e.title.startsWith(d))).toBe(true);
  });
  it("no commit hashes, PR numbers or build codes", () => {
    for (const e of CHANGELOG_ENTRIES) {
      const text = `${e.title} ${e.body}`;
      expect(text).not.toMatch(/\b[0-9a-f]{7,40}\b/);
      expect(text).not.toMatch(/#\d+|\bPR\b|\bb5\d\b|v3-goal/i);
    }
  });
});
