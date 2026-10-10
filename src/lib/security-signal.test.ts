import { describe, expect, it } from "vitest";
import { analyzeSecurity } from "@/lib/market-intel";
import { labelIntel, signalFromScore } from "@/lib/security-signal";

describe("report signal bands", () => {
  it("keeps the score bands the report engine already used", () => {
    expect(signalFromScore(72)).toBe("Strong Buy");
    expect(signalFromScore(71)).toBe("Buy");
    expect(signalFromScore(58)).toBe("Buy");
    expect(signalFromScore(57)).toBe("Hold");
    expect(signalFromScore(42)).toBe("Hold");
    expect(signalFromScore(41)).toBe("Reduce");
    expect(signalFromScore(28)).toBe("Reduce");
    expect(signalFromScore(27)).toBe("Sell");
  });

  it("labels a shared-engine row from its score", () => {
    const row = analyzeSecurity("AIR.NZ");
    expect(row.signal).toBe("Hold");
    expect(labelIntel(row).signal).toBe(signalFromScore(row.score));
    expect(row.convictionReason).not.toMatch(/size positions small/i);
  });
});
