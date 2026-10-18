// pull-check:v3-goal-b33-2026-10-19
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { previewImport, stripPreamble } from "@/lib/import/plan";

const read = (p: string) => readFileSync(p, "utf8");

describe("b33 broker ruling (Chief): plain examples, no rankings, in both model prompts", () => {
  it.each(["src/lib/portfolio-coach-knowledge.ts", "src/lib/personal-guide-knowledge.ts"])("%s", (f) => {
    const s = read(f);
    expect(s).toMatch(/Brokers may be named only as plain examples, in no particular order/);
    expect(s).toMatch(/Never rank, compare, recommend or endorse one/);
    expect(s).not.toMatch(/Never name any broker/);
    expect(s).not.toMatch(/do not name one/);
  });
});

describe("b33 M-7: negative change on the dark board meets AA", () => {
  it("rose-600 inside chrome-dark is rose-400 (#fb7185, 6.4:1 on #0f172a)", () => {
    expect(read("src/app/globals.css")).toMatch(/\.chrome-dark \.text-rose-600 \{\s*color: #fb7185;/);
  });
});

describe("b33 G-14: focus cannot leave the Add panel; the pricing scroller is focusable", () => {
  it("a focusin guard pulls focus back into the panel (except its own popovers)", () => {
    const s = read("src/components/dashboard/TransactionDialog.tsx");
    expect(s).toMatch(/document\.addEventListener\("focusin", onFocusIn\)/);
    expect(s).toMatch(/data-radix-popper-content-wrapper/);
  });
  it("the plan comparison scroller has tabIndex, role region and a label", () => {
    expect(read("src/components/pricing/FeatureComparison.tsx")).toMatch(/tabIndex=\{0\} role="region" aria-label="Plan feature comparison/);
  });
});

describe("b33 H-10: a leading # note row no longer hides the header", () => {
  it("stripPreamble skips comment and blank rows, at most 5", () => {
    expect(stripPreamble([["# note"], [""], ["Date", "Code"], ["1", "2"]])).toEqual([["Date", "Code"], ["1", "2"]]);
    expect(stripPreamble([["Date"], ["# not preamble"]])).toEqual([["Date"], ["# not preamble"]]);
  });
  it.each([
    ["asb.csv", "asb", 3, -255],
    ["jarden.csv", "jarden", 3, -1240],
  ])("TT's %s fixture previews as %s, %i rows, NZ$%d", async (file, broker, rows, cash) => {
    const p = await previewImport(read(`src/lib/fixtures/broker-import/${file}`));
    expect(p.broker).toBe(broker);
    expect(p.toWrite.length).toBe(rows);
    expect(Math.abs(p.cashNzd - cash)).toBeLessThan(0.01);
  });
});
