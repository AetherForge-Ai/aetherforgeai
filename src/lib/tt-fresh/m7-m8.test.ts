import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { distinctChip } from "@/lib/holdings-table";
import { returnPercentFigure, type SnapshotFigure } from "@/lib/portfolio-snapshot";

const fig = (value: number | null): SnapshotFigure => ({ value, display: value == null ? "—" : `NZ$${value}`, reason: null, maths: { formula: "", inputs: [], arithmetic: "", source: "", asOf: "" } });

describe("TT fresh M7 — one CSV upsell per page", () => {
  it("secondary exports render nothing when locked", () => {
    expect(readFileSync("src/components/tax/CsvExportButton.tsx", "utf8")).toContain("if (!primary && !note) return null;");
    expect(readFileSync("src/app/tax/realised/page.tsx", "utf8").match(/primary=\{false\}/g)?.length).toBe(2);
  });
});

describe("TT fresh M8 — holdings", () => {
  it("total return % is worked out from the cost base", () => {
    expect(returnPercentFigure(fig(50), fig(1000), "f", "s", "a").display).toBe("5.00%");
    expect(returnPercentFigure(fig(null), fig(1000), "f", "s", "a").display).toBe("—");
    expect(returnPercentFigure(fig(5), fig(0), "f", "s", "a").reason).toMatch(/cost base is zero/);
  });
  it("no duplicate chips", () => {
    expect(distinctChip("Metals", "Metals")).toBe("");
    expect(distinctChip("crypto", "Crypto")).toBe("");
    expect(distinctChip("Ethereum", "Crypto")).toBe("Ethereum");
  });
});
