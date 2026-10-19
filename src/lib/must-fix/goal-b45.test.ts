// pull-check:v3-goal-b45-2026-10-19
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { mentionsNzTax, withAssistantDisclaimer, withGuideDisclaimer } from "@/lib/guide-safety";
import { TAX_INDICATIVE_LABEL } from "@/lib/tax-disclaimer";

const read = (p: string) => readFileSync(p, "utf8");
const AI = "General information, not financial advice.";

describe("b45 G-23-TAXLABEL: NZ tax content carries the tax label", () => {
  it("AI answers about NZ tax get the label before the AI line", () => {
    for (const wrap of [withGuideDisclaimer, withAssistantDisclaimer]) {
      const out = wrap("Under the FIF rules the fair dividend rate is 5% of the opening value.");
      expect(out).toContain(TAX_INDICATIVE_LABEL);
      expect(out.trim().endsWith(AI)).toBe(true);
      expect(out.indexOf(TAX_INDICATIVE_LABEL)).toBeLessThan(out.lastIndexOf(AI));
      expect(wrap(out).split(TAX_INDICATIVE_LABEL).length).toBe(2); // idempotent
    }
  });
  it("non-tax answers are unchanged apart from the AI line", () => {
    expect(mentionsNzTax("Your largest holding is 30% of the book.")).toBe(false);
    expect(withGuideDisclaimer("Your largest holding is 30% of the book.")).not.toContain(TAX_INDICATIVE_LABEL);
  });
  it("chat route wraps model replies", () => {
    expect(read("src/app/api/chat/route.ts")).toMatch(/withAssistantDisclaimer\(\s*await createGrokChatCompletion/);
  });
  it("learn guides, compare pages, income tax panel and FIF setting show the label", () => {
    expect(read("src/app/learn/[slug]/page.tsx")).toContain("Indicative, not tax advice.");
    for (const f of ["src/app/compare/[slug]/page.tsx", "src/components/dashboard/IncomeTaxPanel.tsx", "src/components/tax/FifThresholdSetting.tsx"]) {
      expect(read(f), f).toContain("TAX_INDICATIVE_LABEL");
    }
  });
});

describe("b45 H-1 ticker: deadline fallback, floor, version 0, equity rows", () => {
  const route = read("src/app/api/ticker/route.ts");
  it("the snapshot-only reply is built in parallel and gets the rest of the budget", () => {
    expect(route).toContain("const fallbackReply = fallbackSnapshot(trace)"); // b46
    expect(route).toContain("TICKER_TOTAL_BUDGET_MS - (Date.now() - t0)");
    expect(route).not.toContain("withDeadline(snapshotOnlyResponse(snap, floor).catch(() => null), 600, null)");
  });
  it("never a version-0 reply", () => {
    expect(route).not.toContain('"x-af-snapshot-version": "0"');
    expect(route).toContain("if (!snap) return null;");
  });
  it("below-floor replies are marked with the floor", () => {
    expect(route.match(/belowFloorHeaders\(/g)?.length).toBeGreaterThanOrEqual(4);
  });
  it("keeps the last equity rows when a build has none", () => {
    expect(route.match(/keepEquityRows\(await loadPublicTicker/g)?.length).toBe(2);
  });
  it("the writer refreshes the colo copy", () => {
    expect(read("src/lib/crypto-snapshot.ts")).toContain("await keepAlive(edgeSnapshotPut(parsed)");
  });
});

describe("b45 P3: date tab stop and cold-load CLS", () => {
  it("calendar button is not a separate tab stop", () => {
    expect(read("src/components/dashboard/RecordTransactionPanel.tsx")).toContain("af-date-overlay");
    expect(read("src/app/globals.css")).toContain(".af-date-overlay::-webkit-calendar-picker-indicator");
  });
});

describe("b45 G-14: Playwright Tab-cycle harness exists", () => {
  it("checks focus after every Tab and Shift+Tab", () => {
    const src = read("qa/local-harness/add-panel-tab-cycle.mjs");
    expect(src).toContain("record-transaction-dialog");
    expect(src).toContain("Shift+Tab");
  });
});

describe("b45 version", () => {
  it("build marker", () => {
    expect(read("public/build-version.txt")).toContain("v3-goal-b46-2026-10-19");
  });
});
