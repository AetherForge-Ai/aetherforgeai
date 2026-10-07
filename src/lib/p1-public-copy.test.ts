import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ANNUAL_SAVINGS_PCT } from "./plans";
import {
  ANALYTICS_NOTICE,
  ENGINE_PARAGRAPH,
  LEGAL_UPDATED,
  REFUND_FAQ,
  TRIAL_CARD_LINE,
  TRIAL_FAQ,
} from "./public-copy";
import { TERMS_VERSION } from "./signup-consent";

function read(rel: string) {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

/** Comments are not shown. Collapse whitespace the way the page does. */
function renderedCopy(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .replace(/\s+/g, " ");
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
    expect(terms).not.toContain("TRIAL_FAQ");
    expect(terms).not.toContain("Yes. Starter and Pro each begin");
    expect(terms).toContain("{TRIAL_CARD_LINE}");
    expect(terms).toContain("{REFUND_FAQ}");
    expect(terms).toContain("Prices are shown on our pricing page.");
    const taxWord = ["G", "ST"].join("");
    for (const file of [
      "src/app/terms-of-service/page.tsx",
      "src/app/pricing/page.tsx",
      "src/lib/public-copy.ts",
      "src/components/tax/TaxPageContent.tsx",
      "src/components/pricing/PricingCards.tsx",
      "src/components/pricing/PricingFAQ.tsx",
    ]) {
      expect(read(file)).not.toContain(taxWord);
    }
    expect(read("src/app/pricing/page.tsx")).toContain("All prices in NZD.");
    expect(read("src/lib/public-copy.ts")).not.toContain("SUPPORT_MAILBOX_LABEL");
    expect(TRIAL_FAQ).toMatch(/14-day trial/);
    expect(TRIAL_CARD_LINE).toMatch(/card is collected at checkout/);
    expect(REFUND_FAQ).toMatch(/we'll make it right/);
    expect(read("src/components/pricing/PricingFAQ.tsx")).toContain("REFUND_FAQ");
    expect(read("src/components/pricing/PricingFAQ.tsx")).toContain("TRIAL_FAQ");
    expect(read("src/components/pricing/PricingCards.tsx")).toContain("TRIAL_CARD_LINE");
  });

  it("renders the pricing footnote with a space around the trial line", () => {
    const cards = read("src/components/pricing/PricingCards.tsx");
    expect(cards).toContain('%).{" "}');
    expect(cards).toContain('{TRIAL_CARD_LINE}{" "}');
    const rendered = `(save ~${ANNUAL_SAVINGS_PCT}%). ${TRIAL_CARD_LINE} Ultimate is Talk to us.`;
    expect(rendered).toBe(
      "(save ~16.67%). Starter and Pro include a 14-day trial and a card is collected at checkout. Cancel anytime. Ultimate is Talk to us."
    );
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

  it("does not tell a visitor that a fact is unconfirmed", () => {
    const rendered = [
      "src/lib/public-copy.ts",
      "src/components/SiteFooter.tsx",
      "src/components/AnalyticsNotice.tsx",
      "src/components/pricing/PricingCards.tsx",
      "src/components/pricing/PricingFAQ.tsx",
      "src/components/about/AboutContent.tsx",
      "src/app/terms-of-service/page.tsx",
      "src/app/privacy-policy/page.tsx",
      "src/app/ai-disclaimer/page.tsx",
      "src/app/trust/page.tsx",
      "src/app/pricing/page.tsx",
      "src/app/how-it-works/page.tsx",
      "src/app/how-to-maximize-results/page.tsx",
    ]
      .map((file) => renderedCopy(read(file)))
      .join("\n");
    expect(rendered).not.toMatch(/not confirmed/i);
    expect(rendered).not.toMatch(/not published here/i);
    expect(rendered).not.toMatch(/A past date suggests/);
    expect(rendered).not.toMatch(/until it is confirmed/i);
    expect(rendered).not.toMatch(/until the company confirms/i);
    expect(rendered).toContain("https://x.com/aetherforgeAi_");
    expect(rendered).toContain("https://www.facebook.com/profile.php?id=61591701002008");
    expect(rendered).toContain("https://www.linkedin.com/in/aether-forge-ai-27659b423/");
    expect(read("src/components/about/AboutContent.tsx")).not.toContain("<footer");
  });
});
