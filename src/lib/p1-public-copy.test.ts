import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ANALYTICS_NOTICE,
  ENGINE_PARAGRAPH,
  GST_STATEMENT,
  LEGAL_UPDATED,
  REFUND_FAQ,
  TRIAL_CARD_LINE,
  TRIAL_FAQ,
} from "./public-copy";
import { TERMS_VERSION } from "./signup-consent";

function read(rel: string) {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

describe("P1 public copy", () => {
  it("re-issues the legal pages on the same date as TERMS_VERSION", () => {
    expect(TERMS_VERSION).toBe("2026-10-07");
    expect(LEGAL_UPDATED).toBe("7 October 2026");
    for (const file of [
      "src/app/terms-of-service/page.tsx",
      "src/app/privacy-policy/page.tsx",
      "src/app/ai-disclaimer/page.tsx",
    ]) {
      expect(read(file)).toContain("LEGAL_UPDATED");
    }
    const terms = read("src/app/terms-of-service/page.tsx");
    expect(terms).not.toMatch(/weekly/i);
    expect(terms).toContain("{TRIAL_FAQ}");
    expect(terms).toContain("{TRIAL_CARD_LINE}");
    expect(terms).toContain("{REFUND_FAQ}");
    expect(terms).toContain("GST_STATEMENT");
    expect(TRIAL_FAQ).toMatch(/14-day trial/);
    expect(TRIAL_CARD_LINE).toMatch(/card is collected at checkout/);
    expect(REFUND_FAQ).toMatch(/we'll make it right/);
    expect(read("src/app/pricing/page.tsx")).toContain("GST_STATEMENT");
    expect(read("src/components/pricing/PricingFAQ.tsx")).toContain("REFUND_FAQ");
    expect(read("src/components/pricing/PricingFAQ.tsx")).toContain("TRIAL_FAQ");
    expect(read("src/components/pricing/PricingCards.tsx")).toContain("TRIAL_CARD_LINE");
    expect(GST_STATEMENT).toMatch(/GST/);
    expect(GST_STATEMENT).not.toMatch(/including GST|excluding GST/);
  });

  it("uses one engine paragraph on projections and the AI disclaimer", () => {
    const explorer = read("src/components/dashboard/ProjectionsExplorer.tsx");
    const disclaimer = read("src/app/ai-disclaimer/page.tsx");
    expect(explorer).toContain("ENGINE_PARAGRAPH");
    expect(disclaimer).toContain("ENGINE_PARAGRAPH");
    expect(ENGINE_PARAGRAPH).toMatch(/rules-based technical-analysis engine/);
    expect(ENGINE_PARAGRAPH).toMatch(/AI writes the plain-English note/);
  });

  it("drops the old privacy and security claims", () => {
    const tree = [
      "src/app/how-it-works/page.tsx",
      "src/app/pricing/page.tsx",
      "src/app/privacy-policy/page.tsx",
      "src/app/trust/page.tsx",
    ]
      .map(read)
      .join("\n");
    expect(tree).not.toMatch(/never shared/i);
    expect(tree).not.toMatch(/bank-grade/i);
    expect(read("src/app/privacy-policy/page.tsx")).toMatch(/country/);
    expect(read("src/components/AnalyticsNotice.tsx")).toContain("ANALYTICS_NOTICE");
    expect(ANALYTICS_NOTICE).toBe("We use Google Analytics to see which pages are used.");
    expect(read("src/app/layout.tsx")).toContain("<AnalyticsNotice");
  });
});
