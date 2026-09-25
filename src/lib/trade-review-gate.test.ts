import { describe, expect, it } from "vitest";
import { TRADE_REVIEW_ARM_MS, reviewClickIsArmed } from "@/lib/trade-confirm";

describe("trade review arm", () => {
  it("ignores a confirm click inside the arm window", () => {
    const armedAt = 1_000;
    expect(reviewClickIsArmed(0, armedAt + TRADE_REVIEW_ARM_MS)).toBe(false);
    expect(reviewClickIsArmed(armedAt, armedAt + TRADE_REVIEW_ARM_MS - 1)).toBe(false);
    expect(reviewClickIsArmed(armedAt, armedAt + TRADE_REVIEW_ARM_MS)).toBe(true);
  });
});
