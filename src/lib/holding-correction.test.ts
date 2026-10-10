import { describe, expect, it } from "vitest";
import {
  CORRECTION_CASH_TOOLTIP,
  collapseCorrectionNote,
  correctionChangeLabel,
  ensureCorrectionCurrency,
  planHoldingCorrection,
} from "@/lib/holding-correction";

describe("M1 correction rows", () => {
  it("writes one currency sentence, even when the caller already sent it", () => {
    const first = planHoldingCorrection({
      beforeShares: 9000,
      afterShares: 9000,
      beforePrice: 2.22,
      afterPrice: 2.21,
      currency: "NZD",
    });
    expect(first.notes).toBe("Correction: 9000 at NZ$2.22 → 9000 at NZ$2.21. Cash unchanged.");
    const again = planHoldingCorrection({
      beforeShares: 9000,
      afterShares: 9000,
      beforePrice: 2.22,
      afterPrice: 2.21,
      currency: "NZD",
      note: first.notes,
    });
    expect(again.notes).toBe("Correction: 9000 at NZ$2.22 → 9000 at NZ$2.21. Cash unchanged.");
    expect(again.notes.match(/Correction:/g)).toHaveLength(1);
  });

  it("keeps a member note as one labelled sentence", () => {
    const plan = planHoldingCorrection({
      beforeShares: 9000,
      afterShares: 9000,
      beforePrice: 2.22,
      afterPrice: 2.21,
      currency: "NZD",
      note: "Broker statement checked.",
    });
    expect(plan.notes).toBe(
      "Correction: 9000 at NZ$2.22 → 9000 at NZ$2.21. Cash unchanged. Note: Broker statement checked."
    );
  });

  it("shows currency on the row and names the cash note", () => {
    const duplicated =
      "Correction: 9000 at 2.22 → 9000 at 2.21. Correction: 9000 at 2.22 → 9000 at 2.21.";
    expect(correctionChangeLabel(duplicated, "NZD")).toBe("9000 at NZ$2.22 → 9000 at NZ$2.21");
    expect(ensureCorrectionCurrency(collapseCorrectionNote(duplicated), "NZD")).toBe(
      "Correction: 9000 at NZ$2.22 → 9000 at NZ$2.21. Cash unchanged."
    );
    expect(CORRECTION_CASH_TOOLTIP).toBe("Correction adjusts cost basis; cash unchanged.");
  });

  it("keeps a sub-cent fill in the note", () => {
    const plan = planHoldingCorrection({
      beforeShares: 2750000,
      afterShares: 2750000,
      beforePrice: 0.0000040399,
      afterPrice: 0.0000040399,
      currency: "USD",
    });
    expect(plan.notes).toContain("US$0.0000040399");
    expect(correctionChangeLabel(plan.notes, "USD")).toContain("0.0000040399");
  });
});
