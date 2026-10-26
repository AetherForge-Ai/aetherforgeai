// pull-check:v3-goal-b21-2026-10-18
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { heldMetalRows } from "@/lib/metal-valuation";
import { GUIDES } from "@/data/learn-content";

const read = (p: string) => readFileSync(p, "utf8");

describe("Goal b21", () => {
  it("pins the build", () => expect(read("public/build-version.txt").trim()).toMatch(/^v3-(?:goal|h1|g24|dedupe|g10|del404|fix|m7|cr6|g18|cr6b|dashclean)-b\d+[a-z]?-2026-10-\d\d$/));
  it("G-08: per-oz row shows spot itself, value = oz × spot to the cent", () => {
    const rows = heldMetalRows([{ metal: "gold", ounces: 0.01, marketValueNZD: 74.4, purchasePerOz: 7000 } as never], { gold: 7438.57 });
    expect(rows[0].pricePerOz).toBe(7438.57);
    expect(rows[0].valueNzd).toBe(74.39);
    expect(read("src/components/dashboard/PreciousMetals.tsx")).not.toContain(">Smitty spot prices<");
  });
  it("H-4: the 500-row page renders the server quota", () => {
    expect(read("src/components/dashboard/Fixture500Page.tsx")).toMatch(/ServerQuotaStrip/);
  });
  it("G-23: every guide fact has a source or a reason; slugs, titles and descriptions are unique", () => {
    expect(GUIDES.length).toBeGreaterThanOrEqual(19);
    for (const g of GUIDES) for (const f of g.facts) expect(f.source != null || !!f.missingReason).toBe(true);
    for (const key of ["slug", "title", "description"] as const) expect(new Set(GUIDES.map((g) => g[key])).size).toBe(GUIDES.length);
    expect(JSON.stringify(GUIDES)).not.toMatch(/\bGST\b/);
  });
});
