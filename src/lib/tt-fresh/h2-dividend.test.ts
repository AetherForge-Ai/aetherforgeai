import { describe, it, expect } from "vitest";
import { findDuplicateDividend, mergeDividendRows, type DividendView } from "@/lib/dividend-ledger";

const row = (id: string, when = "2026-10-14", cash = 15): DividendView => ({
  id, when, ticker: "FPH.NZ", assetName: "Fisher & Paykel", assetType: "stock", parts: null, cashNzd: cash,
});

describe("TT fresh H2 — dividend form", () => {
  it("keeps a just-saved row when a refresh returns the old list", () => {
    expect(mergeDividendRows([], [row("new")]).map((r) => r.id)).toEqual(["new"]);
    expect(mergeDividendRows([row("new")], [row("new")]).length).toBe(1);
  });
  it("warns on same holding, date and amount", () => {
    expect(findDuplicateDividend([row("a")], { ticker: "fph.nz", when: "2026-10-14", cashNzd: 15 })).not.toBeNull();
    expect(findDuplicateDividend([row("a")], { ticker: "FPH.NZ", when: "2026-10-15", cashNzd: 15 })).toBeNull();
    expect(findDuplicateDividend([row("a")], { ticker: "FPH.NZ", when: "2026-10-14", cashNzd: 16 })).toBeNull();
  });
  it("the view shows a success toast", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("src/components/tax/DividendLedgerView.tsx", "utf8");
    expect(src).toMatch(/toast\.success\(`Dividend recorded/);
  });
});
