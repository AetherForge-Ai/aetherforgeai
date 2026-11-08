/** b97 DEX-1 (TT P3): on /markets?tab=dex the "Showing N of up to 400" label equals the rows rendered after dedupe. */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { dedupeDexRows, dexNoticeForShown } from "@/lib/crypto-dex";
import { dexCoverageLine } from "@/lib/crypto-coverage";

const src = readFileSync("src/components/dashboard/MarketsExplorer.tsx", "utf8");

describe("DEX-1 shown count equals rendered rows", () => {
  it("dedupes by network|pool key (case-insensitive), keeping the first", () => {
    const rows = [{ key: "solana|AbC" }, { key: "solana|abc" }, { key: "base|abc" }, { key: "solana|xyz" }];
    expect(dedupeDexRows(rows).map((r) => r.key)).toEqual(["solana|AbC", "base|abc", "solana|xyz"]);
  });

  it("77 rendered rows from a 51-row server count read 77 in both lines", () => {
    const rendered = dedupeDexRows(Array.from({ length: 80 }, (_, i) => ({ key: `eth|${i % 77}` })));
    expect(rendered).toHaveLength(77);
    expect(dexCoverageLine(rendered.length)).toBe("Showing 77 of up to 400");
    expect(dexNoticeForShown("Showing 51 of up to 400. The rate limit stopped the list.", rendered.length)).toBe(
      "Showing 77 of up to 400. The rate limit stopped the list."
    );
    expect(dexNoticeForShown(null, 77)).toBeNull();
  });

  it("the table, the coverage line and the notice all use the one deduped dexAll list", () => {
    expect(src).toMatch(/return dedupeDexRows\(all\);/);
    expect(src).toMatch(/if \(isDexTab\) \{\n\s+all = dexAll;/);
    expect(src).toMatch(/\? dexAll\.length\n/);
    expect(src).toContain("dexNoticeForShown(dex.notice, dexAll.length)");
    expect(src).not.toMatch(/\? dex\.rows\.length \|\| seedDexTab\?\.listCount/);
  });
});
