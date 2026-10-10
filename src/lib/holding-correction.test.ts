import { describe, expect, it } from "vitest";
import {
  CORRECTION_CASH_TOOLTIP,
  collapseCorrectionNote,
  correctionChangeLabel,
  planHoldingCorrection,
} from "@/lib/holding-correction";

describe("M1 correction rows", () => {
  it("writes the before → after note once, even when the caller already sent it", () => {
    const first = planHoldingCorrection({
      beforeShares: 9000,
      afterShares: 9000,
      beforePrice: 2.22,
      afterPrice: 2.21,
    });
    expect(first.notes).toBe("Correction: 9000 at 2.22 → 9000 at 2.21.");
    const again = planHoldingCorrection({
      beforeShares: 9000,
      afterShares: 9000,
      beforePrice: 2.22,
      afterPrice: 2.21,
      note: first.notes,
    });
    expect(again.notes).toBe("Correction: 9000 at 2.22 → 9000 at 2.21.");
    expect(again.notes.match(/Correction:/g)).toHaveLength(1);
  });

  it("keeps a member note after the single correction sentence", () => {
    const plan = planHoldingCorrection({
      beforeShares: 9000,
      afterShares: 9000,
      beforePrice: 2.22,
      afterPrice: 2.21,
      note: "Broker statement checked.",
    });
    expect(plan.notes).toBe("Correction: 9000 at 2.22 → 9000 at 2.21. Broker statement checked.");
  });

  it("shows qty and price before → after, and names the cash tooltip", () => {
    const duplicated =
      "Correction: 9000 at 2.22 → 9000 at 2.21. Correction: 9000 at 2.22 → 9000 at 2.21.";
    expect(collapseCorrectionNote(duplicated)).toBe("Correction: 9000 at 2.22 → 9000 at 2.21.");
    expect(correctionChangeLabel(duplicated)).toBe("9000 at 2.22 → 9000 at 2.21");
    expect(CORRECTION_CASH_TOOLTIP).toBe("Correction adjusts cost basis; cash unchanged.");
  });

  it("does not round a sub-cent correction price to 0.00", () => {
    const plan = planHoldingCorrection({
      beforeShares: 1000,
      afterShares: 1000,
      beforePrice: 0.00001,
      afterPrice: 0.0000040399,
    });
    expect(plan.notes).toContain("0.00001");
    expect(plan.notes).toContain("0.0000040399");
    expect(correctionChangeLabel(plan.notes)).toContain("0.0000040399");
  });
});
