import { describe, expect, it } from "vitest";
import { tickerMatchRank } from "@/lib/asset-search";

describe("ticker match rank", () => {
  it("ranks the US equity above a leveraged product that starts with the same letters", () => {
    const apple = tickerMatchRank("AAPL", "Apple Inc.", "AAPL");
    const leveraged = tickerMatchRank("AAPLX3L", "Apple 3x Long", "aapl");
    expect(apple).toBeLessThan(leveraged);
    expect(tickerMatchRank("AAPL.AX", "Apple", "AAPL")).toBeGreaterThan(apple);
  });
});
