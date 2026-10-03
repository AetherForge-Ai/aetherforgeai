import { describe, expect, it } from "vitest";
import { publicMarketNote } from "@/components/dashboard/intel-ui";

describe("publicMarketNote", () => {
  it("strips a leading recommendation word", () => {
    const note = publicMarketNote("Buy · MACD is positive.");
    expect(note.toLowerCase().startsWith("buy")).toBe(false);
    expect(note).toContain("MACD is positive");
  });

  it("strips a trailing recommendation word", () => {
    const note = publicMarketNote("MACD is positive. Buy");
    expect(note).toContain("MACD is positive");
    expect(note.trim().toLowerCase().endsWith("buy")).toBe(false);
  });
});
