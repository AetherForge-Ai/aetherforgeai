import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { periodGapReason } from "@/lib/performance-math";

const read = (p: string) => readFileSync(p, "utf8");

describe("goal b15", () => {
  it("pins the build", () => expect(read("public/build-version.txt").trim()).toMatch(/^v3-(?:goal|h1|g24|dedupe|g10|del404|fix|m7|cr6|g18|cr6b|dashclean|dashclean-d|dashclean-e)-b(1[5-9]|[2-9][0-9])[a-z]?-/));
  it("G-02: a young book says when it started", () => {
    const input = { asOf: "2026-10-18", endingNzd: 9950, points: [{ date: "2026-10-13", valueBeforeNzd: 0, flowNzd: 10000 }] } as never;
    expect(periodGapReason(input, "1M" as never)).toBe("Book started 13 Oct 2026, after the start of this period.");
  });
  it("G-01: yield states the fee basis", () => expect(read("src/components/tax/DividendLedgerView.tsx")).toContain("(cost incl. brokerage fees)"));
  it("H-12: methodology has method, bad periods, no invented figures", () => {
    const src = read("src/app/methodology/page.tsx");
    expect(src).toContain("Mar 2020");
    expect(src).toContain("Past results do not predict future results. General information, not financial advice.");
    expect(src).not.toMatch(/hit rate of \d/i);
    expect(src).not.toContain("We have not published a backtest yet");
  });
  it("M-6: cash actions are real and labelled", () => {
    const src = read("src/components/dashboard/UnifiedHoldingsTable.tsx");
    expect(src).toContain('aria-label="Actions for Cash"');
    expect(src).not.toContain("FX convert is not on this table yet");
    expect(src).toContain("min-[1440px]:whitespace-normal");
  });
});
