import { describe, expect, it } from "vitest";
import { formatAlertRuleLine, formatSellStopChip, formatTrimChip } from "@/lib/alert-labels";

describe("alert trim and sell chips", () => {
  const cryptoDefaults = {
    trimPct: 25,
    trimTriggerDipPct: 3,
    takeProfitMinPct: 8,
    takeProfitMaxPct: 12,
  };

  it("shows the take-profit band on the trim chip for crypto and stocks", () => {
    expect(formatTrimChip(cryptoDefaults)).toBe("Trim 25% @ +8–12%");
    expect(formatTrimChip({ trimPct: 25, trimTriggerDipPct: 6, takeProfitMinPct: 12, takeProfitMaxPct: 15 })).toBe(
      "Trim 25% @ +12–15%"
    );
  });

  it("builds the card sentence from the saved percents", () => {
    expect(
      formatAlertRuleLine({ trimPct: 10, trimTriggerDipPct: 4, takeProfitMinPct: 8, takeProfitMaxPct: 12 })
    ).toBe("Trim 10% at a 4% dip. take profit +8–12%.");
  });

  it("keeps the loss percent on the sell/stop chip only", () => {
    expect(formatSellStopChip(cryptoDefaults)).toBe("−3%");
    expect(formatTrimChip(cryptoDefaults)).not.toContain("−3");
    expect(formatTrimChip(cryptoDefaults)).not.toContain("-3");
    expect(formatSellStopChip({ trimTriggerDipPct: null })).toBe("—");
  });
});
