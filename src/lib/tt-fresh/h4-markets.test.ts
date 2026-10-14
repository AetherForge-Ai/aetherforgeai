import { vi } from "vitest";
vi.mock("server-only", () => ({}));
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolveSparkQuote } from "@/lib/yahoo-finance";

describe("TT fresh H4 — /markets stock boards", () => {
  it("spark quotes carry the session high and low", () => {
    const q = resolveSparkQuote({ close: [10, 10.2], chartPreviousClose: 10, dayHigh: 10.4, dayLow: 9.9 });
    expect(q?.dayHigh).toBe(10.4);
    expect(q?.dayLow).toBe(9.9);
  });
  it("an inverted or missing range is dropped", () => {
    expect(resolveSparkQuote({ close: [10], dayHigh: 9, dayLow: 10 })?.dayHigh).toBeUndefined();
    expect(resolveSparkQuote({ close: [10] })?.dayLow).toBeUndefined();
  });
  it("the API passes the range and the source line is printed once", () => {
    const route = readFileSync("src/app/api/all-markets/route.ts", "utf8");
    expect(route).toContain("dayHigh: row.dayHigh");
    const ui = readFileSync("src/components/dashboard/MarketsExplorer.tsx", "utf8");
    expect(ui.match(/r\.source \|\| "Last good"/g)?.length).toBe(1);
    expect(ui).not.toContain("quoted on this page");
  });
});
