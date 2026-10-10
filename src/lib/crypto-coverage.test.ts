import { describe, expect, it } from "vitest";
import { cryptoCoverageCount, cryptoCoveragePhrase } from "@/lib/crypto-coverage";

describe("crypto coverage phrase", () => {
  it("names the top 400 and never rounds a short list to about 90", () => {
    expect(cryptoCoverageCount(400)).toBe(400);
    expect(cryptoCoveragePhrase(400)).toBe("The top 400 coins by market cap");
    expect(cryptoCoverageCount(89)).toBe(89);
    expect(cryptoCoveragePhrase(89)).toBe("The top 89 coins by market cap");
    expect(cryptoCoveragePhrase(89)).not.toMatch(/~/);
    expect(cryptoCoveragePhrase(500)).toBe("The top 400 coins by market cap");
  });

  it("stays number-free when the list is empty", () => {
    expect(cryptoCoveragePhrase(0)).toBe("The largest coins by market cap");
  });
});
