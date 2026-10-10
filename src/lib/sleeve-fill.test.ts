import { describe, expect, it } from "vitest";
import { sleeveFillNotes, unallocatedSleeve } from "@/lib/sleeve-fill";

describe("sleeve fill", () => {
  it("leaves NZ$15,000.00 unallocated when two names cannot fill a NZ$55,000.00 sleeve", () => {
    expect(
      unallocatedSleeve({ targetNZD: 55000, heldNZD: 0, capNZD: 20000, qualifyingPicks: 2 })
    ).toBe(15000);
    const notes = sleeveFillNotes({
      totalNZD: 100000,
      maxPositionWeightPct: 20,
      moves: [
        { assetClass: "equities", targetValueNZD: 55000, currentValueNZD: 0 },
        { assetClass: "crypto", targetValueNZD: 20000, currentValueNZD: 0 },
      ],
      picks: {
        equitiesQualifying: 2,
        cryptoQualifying: 1,
        equitiesNotSized: ["MAH.AX (only 2 new names are sized on this tape)"],
      },
    });
    expect(notes).toEqual([
      "Equities sleeve: NZ$15,000.00 unallocated: not enough qualifying picks. Not sized, and not used to fill this sleeve: MAH.AX (only 2 new names are sized on this tape).",
    ]);
    expect(notes.join(" ")).not.toMatch(/Crypto sleeve/);
  });

  it("says nothing when the bot has not been run", () => {
    expect(
      sleeveFillNotes({
        totalNZD: 100000,
        maxPositionWeightPct: 20,
        moves: [{ assetClass: "equities", targetValueNZD: 55000, currentValueNZD: 0 }],
      })
    ).toEqual([]);
  });
});
