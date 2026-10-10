import { describe, expect, it } from "vitest";
import { moverSweepCaption } from "@/lib/mover-sweep";

describe("M7 mover sweep caption", () => {
  it("names crypto gainers for Koins and share-price gainers for Stox", () => {
    expect(moverSweepCaption("crypto")).toBe(
      "Biggest crypto gainers on each exchange over 24 hours, 7 days and the last month.",
    );
    expect(moverSweepCaption("stock")).toContain("Biggest share-price gainers");
    expect(moverSweepCaption("crypto", "html")).toContain("Biggest crypto gainers");
    expect(moverSweepCaption("stock", "html")).toContain("Biggest share-price gainers");
  });
});
