import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AI_PROVIDER_API_SENTENCE, AI_PROVIDER_NAME } from "@/lib/ai-provider-disclosure";
import { ONE_LINE_DISCLAIMER } from "@/lib/public-copy";

function read(rel: string) {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

/** Comments and import lines are not rendered. */
function rendered(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .replace(/^\s*import\s[\s\S]*?from\s+["'][^"']+["'];?/gm, "");
}

function pages(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) pages(full, acc);
    else if (entry.name === "page.tsx") acc.push(path.relative(process.cwd(), full));
  }
  return acc;
}

const LEGAL_PAGES = [
  "src/app/privacy-policy/page.tsx",
  "src/app/trust/page.tsx",
  "src/app/ai-disclaimer/page.tsx",
  "src/app/terms-of-service/page.tsx",
] as const;

const BANNED = [
  "or call",
  "SuperGrok",
  "our AI provider",
  "simulated, estimated",
  "White-label",
  "white labelling",
  "Strategy consultation",
  "Execution Coach",
] as const;

const COPY_FILES = [
  "src/lib/public-copy.ts",
  "src/lib/plans.ts",
  "src/lib/pricing-faq.ts",
  "src/lib/help-index.ts",
  "src/lib/public-schema.ts",
  "src/lib/report-html.ts",
  "src/lib/trial-report-html.ts",
  "src/lib/report-copy.ts",
  "src/lib/bot-guides.ts",
  "src/lib/weekly-email-copy.ts",
  "src/lib/portfolio-coach-knowledge.ts",
  "src/components/SiteFooter.tsx",
  "src/components/legal/DisclaimerNotice.tsx",
  "src/components/pricing/FeatureComparison.tsx",
  "src/components/pricing/PricingCards.tsx",
  "src/components/pricing/PricingFAQ.tsx",
];

function renderedPage(rel: string): string {
  const text = rendered(read(rel));
  if (!LEGAL_PAGES.includes(rel as (typeof LEGAL_PAGES)[number])) return text;
  return `${text}\n${AI_PROVIDER_API_SENTENCE}\n${AI_PROVIDER_NAME}`;
}

describe("public legal wording", () => {
  const pageFiles = pages(path.join(process.cwd(), "src/app"));

  it("keeps the banned acceptance strings out of rendered public copy", () => {
    const files = [...pageFiles, ...COPY_FILES];
    for (const rel of files) {
      const text = renderedPage(rel);
      for (const phrase of BANNED) {
        expect(text, `${rel} contains ${phrase}`).not.toContain(phrase);
      }
      expect(text, rel).not.toMatch(/\bGST\b/);
      expect(text, rel).not.toMatch(/\bgrok-\d/);
    }
  });

  it("shows xAI (Grok) only on the legal and disclosure pages, with no model number", () => {
    expect(AI_PROVIDER_NAME).toBe("xAI (Grok)");
    expect(AI_PROVIDER_API_SENTENCE).toContain("up to 30 days");
    expect(AI_PROVIDER_API_SENTENCE).not.toMatch(/grok-\d|zero data retention/i);
    for (const rel of LEGAL_PAGES) {
      expect(renderedPage(rel), rel).toContain("xAI (Grok)");
      expect(read(rel), rel).toContain("AI_PROVIDER_API_SENTENCE");
    }
    const others = [...pageFiles.filter((rel) => !LEGAL_PAGES.includes(rel as (typeof LEGAL_PAGES)[number])), ...COPY_FILES];
    for (const rel of others) {
      expect(renderedPage(rel), rel).not.toContain("xAI (Grok)");
      expect(renderedPage(rel), rel).not.toMatch(/\bxAI\b/);
    }
  });

  it("puts the one-line disclaimer in the footer and on the AI disclaimer", () => {
    expect(ONE_LINE_DISCLAIMER).toBe(
      "General information only, not financial advice. FORGE INTELLIGENCE LIMITED is not a licensed financial advice provider."
    );
    expect(read("src/components/SiteFooter.tsx")).toContain("ONE_LINE_DISCLAIMER");
    expect(read("src/app/ai-disclaimer/page.tsx")).toContain("ONE_LINE_DISCLAIMER");
    expect(read("src/components/legal/DisclaimerNotice.tsx")).toContain("this is not financial advice.");
    expect(read("src/components/legal/DisclaimerNotice.tsx")).toContain("Important — this is not financial advice.");
    expect(read("src/lib/help-index.ts")).toContain("how to email FORGE INTELLIGENCE LIMITED.");
    expect(read("src/lib/help-index.ts")).not.toContain("or call");
    expect(read("src/lib/public-copy.ts")).toContain("TODO: restore phone when 0800 live");
  });

  it("keeps the published prices and the annual refund rule", () => {
    const plans = read("src/lib/plans.ts");
    expect(plans).toContain("monthlyPrice: 0");
    expect(plans).toContain("monthlyPrice: 16");
    expect(plans).toContain("monthlyPrice: 49");
    expect(plans).toContain("monthlyPrice: 199");
    expect(plans).toContain("yearlyPrice: 160");
    expect(plans).toContain("yearlyPrice: 490");
    expect(plans).toContain("yearlyPrice: 1990");
    expect(plans).toContain("API access");
    expect(plans).toContain("Up to 5 seats");
    expect(plans).not.toContain("White-label");
    expect(plans).not.toContain("Strategy consultation");
    const compare = read("src/components/pricing/FeatureComparison.tsx");
    expect(compare).toContain("Priority processing");
    expect(compare).toContain('"Fastest", "Fastest"');
    expect(compare).toContain('"Up to 5"');
    expect(read("src/lib/pricing-faq.ts")).toContain("Ultimate includes dedicated email support.");
    expect(read("src/lib/pricing-faq.ts")).toContain("students or charities");
    expect(read("src/app/refunds/page.tsx")).toContain("ANNUAL_REFUND_RULE");
    expect(read("src/app/terms-of-service/page.tsx")).toContain("ANNUAL_REFUND_RULE");
    expect(read("src/components/SiteFooter.tsx")).toContain('href: "/refunds"');
    expect(read("src/components/pricing/PricingCards.tsx")).toContain('href="/refunds"');
    const disclaimer = rendered(read("src/app/ai-disclaimer/page.tsx"));
    expect(disclaimer).toContain("real public data from third parties");
    expect(disclaimer).toContain("Paper trades on AetherForge are simulated records you enter.");
    expect(disclaimer).toContain("Crypto projections are currently paused.");
  });
});
