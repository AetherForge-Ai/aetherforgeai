import { describe, expect, it } from "vitest";
import { cryptoCoverageCount, cryptoCoveragePhrase } from "@/lib/crypto-coverage";

describe("crypto coverage phrase", () => {
  it("rounds 89 rows to about 90", () => {
    expect(cryptoCoverageCount(89)).toBe(90);
    expect(cryptoCoveragePhrase(89)).toBe("The ~90 largest coins by market cap");
  });

  it("stays number-free when the list is empty", () => {
    expect(cryptoCoveragePhrase(0)).toBe("The largest coins by market cap");
  });
});
