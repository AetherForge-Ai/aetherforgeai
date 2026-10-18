import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parsePastedTrades, type PastedRow } from "@/lib/paste-import";
import { importOversells } from "@/lib/import-oversell";

type Sample = { name: string; text: string; expected: PastedRow[] };
const { samples } = JSON.parse(readFileSync(join(process.cwd(), "qa/fixtures/paste-import/samples.json"), "utf8")) as { samples: Sample[] };

const same = (a: PastedRow, b: PastedRow) =>
  a.date === b.date && a.type === b.type && a.ticker === b.ticker && a.quantity === b.quantity && a.price === b.price && a.currency === b.currency && a.fees === b.fees && a.reference === b.reference;

describe("Goal b20 G-24 paste import, 20 samples, per-row accuracy (fees and references scored)", () => {
  it("has 20 samples", () => expect(samples).toHaveLength(20));
  const report: string[] = [];
  let total = 0;
  let right = 0;
  for (const s of samples) {
    it(`sample ${s.name}`, () => {
      const { rows } = parsePastedTrades(s.text);
      s.expected.forEach((exp, i) => {
        total += 1;
        const ok = rows[i] != null && same(rows[i], exp);
        if (ok) right += 1;
        report.push(`${ok ? "OK  " : "MISS"} ${s.name}#${i + 1} ${ok ? "" : JSON.stringify(rows[i] ?? null)}`);
      });
      expect(rows.length).toBe(s.expected.length);
    });
  }
  it("is at least 95% row-accurate", () => {
    console.log(report.join("\n"), `\naccuracy ${right}/${total}`);
    expect(right / total).toBeGreaterThanOrEqual(0.95);
  });
  it("a sell of an unheld ticker is flagged on review", () => {
    const flags = importOversells([{ line: 2, ticker: "AIR.NZ", side: "Sell", quantity: 100, date: "2026-10-14" }], {});
    expect(flags[2]).toMatch(/^You hold 0 AIR.NZ/);
  });
  it("the second trade keeps its own fee", () => {
    const { rows } = parsePastedTrades(samples.find((s) => s.name === "sell-unheld-own-fee")!.text);
    expect(rows.map((r) => r.fees)).toEqual([5, 3]);
  });
});
