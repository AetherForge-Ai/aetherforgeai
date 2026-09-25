import { describe, expect, it } from "vitest";
import {
  __resetHoldingsGenerationForTests,
  bumpHoldingsGeneration,
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
});
