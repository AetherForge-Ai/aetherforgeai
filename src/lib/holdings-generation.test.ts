import { describe, expect, it } from "vitest";
import {
  __resetHoldingsGenerationForTests,
  bumpHoldingsGeneration,
  holdingsActionAfterDialogClose,
  holdingsGeneration,
  holdingsResponseIsStale,
} from "@/lib/holdings-generation";

describe("holdings snapshot generation", () => {
  it("treats a snapshot captured before a trade commit as stale", () => {
    __resetHoldingsGenerationForTests();
    const captured = holdingsGeneration();
    bumpHoldingsGeneration();
    expect(holdingsResponseIsStale(captured)).toBe(true);
    expect(holdingsResponseIsStale(holdingsGeneration())).toBe(false);
  });

  it("refetches a stale snapshot after a sell and applies a fresh one", () => {
    expect(
      holdingsActionAfterDialogClose({ generationAtOpen: 1, generationNow: 2, pendingGeneration: 1 })
    ).toBe("refetch");
    expect(
      holdingsActionAfterDialogClose({ generationAtOpen: 1, generationNow: 2, pendingGeneration: 2 })
    ).toBe("apply");
    expect(
      holdingsActionAfterDialogClose({ generationAtOpen: 1, generationNow: 1, pendingGeneration: null })
    ).toBe("keep");
  });
});
