import { describe, expect, it } from "vitest";
import { mergeFreshQuantities } from "@/lib/holding-snapshot";

describe("fresh holding quantities", () => {
  it("replaces shares copied before a trade with the post-trade quantity", () => {
    const painted = mergeFreshQuantities(
      [{ _id: "sol", ticker: "SOL", shares: 1, purchase_price: 100, current_price: 180 }],
      [{ _id: "sol", shares: 1.4, purchase_price: 110 }]
    );
    expect(painted[0].shares).toBe(1.4);
    expect(painted[0].purchase_price).toBe(110);
    expect(painted[0].current_price).toBe(180);
  });
});
