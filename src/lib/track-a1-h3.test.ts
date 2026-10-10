import { describe, expect, it } from "vitest";
import { bookCashReserve, buildAllocationPlan } from "@/lib/headmaster-trust";
import { buildStrategy, sleeveNotesForSynthesis, type TotalumSynthesis } from "@/lib/totalum-engine";

describe("Headmaster cents and unallocated sleeves", () => {
  it("keeps NZ$33,291.47 and shows the same unallocated sentence on synthesis and strategy", () => {
    const plan = buildAllocationPlan({
      totalValueNZD: 100211.45,
      cashBalanceNZD: 33291.47,
      classes: [
        { assetClass: "equities", label: "Equities", color: "#000", valueNZD: 31723.31 },
        { assetClass: "crypto", label: "Crypto", color: "#000", valueNZD: 20197.08 },
        { assetClass: "metals", label: "Metals", color: "#000", valueNZD: 14999.59 },
        { assetClass: "cash", label: "Cash", color: "#000", valueNZD: 33291.47 },
      ],
      targets: { equities: 55, crypto: 20, metals: 15, cash: 10 },
      modelName: "Balanced Growth",
      riskLabel: "Moderate",
      projectedReturnPct: 8,
      projectedVolPct: 12,
    });
    expect(plan.cashOnBookNZD).toBe(33291.47);
    expect(plan.narrative).toContain("NZ$33,291.47");
    expect(plan.narrative).not.toContain("NZ$33,291.00");
    expect(plan.reconciled).toBe(true);
    expect(bookCashReserve(33291.47).retainedNZD).toBe(3329.15);

    const synthesis = {
      totalValueNZD: 100000,
      cashBalanceNZD: 0,
      isEmpty: false,
      classAllocation: [
        { assetClass: "equities", valueNZD: 0 },
        { assetClass: "crypto", valueNZD: 0 },
        { assetClass: "metals", valueNZD: 0 },
        { assetClass: "cash", valueNZD: 0 },
      ],
    } as TotalumSynthesis;
    const picks = { equitiesQualifying: 2, cryptoQualifying: 1, equitiesNotSized: [], cryptoNotSized: [] };
    const onSynthesis = sleeveNotesForSynthesis(synthesis, picks);
    const onStrategy = buildStrategy(synthesis, "balanced_growth", picks).sleeveNotes;
    expect(onSynthesis).toEqual(onStrategy);
    expect(onSynthesis.join(" ")).toContain("NZ$15,000.00 unallocated");
    expect(sleeveNotesForSynthesis(synthesis, undefined)).toEqual([]);
  });
});
