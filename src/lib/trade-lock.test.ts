import { describe, expect, it } from "vitest";
import { withUserTradeLock } from "@/lib/trade-lock";

describe("per-account trade lock", () => {
  it("runs overlapping fills one after another", async () => {
    const order: string[] = [];
    const first = withUserTradeLock("user-tt", async () => {
      order.push("a-start");
      await new Promise((r) => setTimeout(r, 30));
      order.push("a-end");
      return 1;
    });
    const second = withUserTradeLock("user-tt", async () => {
      order.push("b-start");
      order.push("b-end");
      return 2;
    });
    const [a, b] = await Promise.all([first, second]);
    expect(a).toBe(1);
    expect(b).toBe(2);
    expect(order).toEqual(["a-start", "a-end", "b-start", "b-end"]);
  });
});
