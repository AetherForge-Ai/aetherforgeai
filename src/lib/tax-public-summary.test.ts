import { describe, expect, it } from "vitest";
import { TAX_PAGE_EXAMPLE, taxPublicWordCount } from "./tax-public-summary";

describe("public tax summary", () => {
  it("is at least 400 words and labels the fixture as an example", () => {
    expect(taxPublicWordCount()).toBeGreaterThanOrEqual(400);
    expect(TAX_PAGE_EXAMPLE.startsWith("Example.")).toBe(true);
    expect(TAX_PAGE_EXAMPLE).not.toMatch(/@/);
    expect(TAX_PAGE_EXAMPLE).not.toMatch(/GST/i);
  });
});
