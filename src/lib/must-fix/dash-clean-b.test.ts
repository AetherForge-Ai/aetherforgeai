import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

describe("DASH-CLEAN PR B: holdings and transactions on mobile", () => {
  it("stacks ledger rows as labelled cards below md, no forced min width", () => {
    const tx = read("src/components/dashboard/TransactionsTab.tsx");
    expect(tx).not.toContain("min-w-[36rem]");
    expect(tx).toContain('<thead className="max-md:sr-only">');
    for (const label of ["Type", "Asset", "Qty × Price", "Fees", "FX", "Cash impact", "Realised", "Date"]) {
      expect(tx).toContain(`data-label="${label}"`);
    }
  });

  it("right-aligns tabular figures on the holdings cards", () => {
    expect(read("src/components/dashboard/UnifiedHoldingsTable.tsx")).toContain('<dd className="tnum min-w-0 text-right tabular-nums">');
  });

  it("gives holdings controls 44px on mobile", () => {
    const src = read("src/components/dashboard/UnifiedHoldingsTable.tsx");
    expect(src).toContain("min-h-11 min-w-11 rounded-md border");
    expect(src).toContain('className="size-11 md:size-8" aria-label={`Actions for');
  });
});
