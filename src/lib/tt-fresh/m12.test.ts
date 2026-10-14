import { describe, it, expect } from "vitest";
import { CHANGELOG_ENTRIES, changelogEntryDay } from "@/lib/changelog-entries";

describe("TT fresh M12 — changelog", () => {
  it("is sorted newest first", () => {
    const days = CHANGELOG_ENTRIES.map((e) => changelogEntryDay(e.title));
    expect(days.every((d) => d > 0)).toBe(true);
    expect([...days].sort((a, b) => b - a)).toEqual(days);
  });
  it("has no developer jargon or commit refs", () => {
    const blob = CHANGELOG_ENTRIES.map((e) => `${e.title} ${e.body}`).join(" ");
    expect(blob).not.toMatch(/\b[0-9a-f]{7,40}\b|Batch \d|live=|chain=|pxat=|host|Jersey|freephone|commit|pull-check/i);
  });
});
