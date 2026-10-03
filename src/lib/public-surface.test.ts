import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function read(rel: string) {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

const MODEL_NAME = /\b(SuperGrok|Grok|xAI|grok-4(?:\.\d+)?|Claude|Gemini|GPT-\d|gpt-4)\b/;

const PUBLIC_COPY = [
  "src/app/page.tsx",
  "src/app/layout.tsx",
  "src/app/performance/page.tsx",
  "src/app/terms-of-service/page.tsx",
  "src/components/pricing/PricingCards.tsx",
  "src/components/pricing/PricingFAQ.tsx",
  "src/components/PricingPlans.tsx",
  "src/components/chat/ChatAssistant.tsx",
  "src/components/bots/BotShowcase.tsx",
  "src/components/bots/ApexReport.tsx",
  "src/components/dashboard/ReportCenter.tsx",
  "src/components/dashboard/AnalysisPanel.tsx",
  "src/components/dashboard/ProjectionsExplorer.tsx",
  "src/components/dashboard/ProjectionsPanel.tsx",
  "src/components/dashboard/MarketWidePerformers.tsx",
  "src/components/trial/TrialExperience.tsx",
  "src/components/trial/TrialReportView.tsx",
  "src/components/performance/LiveExamplesGallery.tsx",
  "src/lib/plans.ts",
  "src/lib/report-html.ts",
  "src/lib/trial-report-html.ts",
];

describe("public copy does not name a model", () => {
  it("says AI on user-facing pages, reports, and metadata", () => {
    for (const rel of PUBLIC_COPY) {
      const text = read(rel);
      expect(text, rel).not.toMatch(MODEL_NAME);
    }
    const zenith = read("src/lib/zenith.ts");
    expect(zenith).toContain('ZENITH_STATE_LABEL = "AI"');
    expect(zenith).toContain("OPERATING MODE: AI research briefing.");
    expect(zenith).not.toContain("OPERATING MODE: SuperGrok");
    expect(zenith).toContain('ZENITH_MODEL_DEFAULT = "grok-4.6"');
    expect(read("src/lib/plans.ts")).toContain("ANNUAL_SAVINGS_PCT = 16.67");
    expect(read("src/app/performance/page.tsx")).toContain("1.98%");
    expect(read("src/app/performance/page.tsx")).not.toContain("2.4%");
    expect(read("src/components/performance/LiveExamplesGallery.tsx")).not.toMatch(/\btoday\b/i);
    expect(read("src/lib/grok.ts")).not.toContain("throw new Error(`Grok");
    expect(read("src/lib/grok.ts")).not.toContain('throw new Error("Grok');
  });
});

describe("public markets table", () => {
  it("does not render a Buy column or row control", () => {
    const explorer = read("src/components/dashboard/MarketsExplorer.tsx");
    const page = read("src/components/dashboard/MarketsPageContent.tsx");
    expect(explorer).not.toContain("openBuy");
    expect(explorer).not.toContain(">Buy</th>");
    expect(explorer).not.toContain(">Buy</span>");
    expect(page).not.toContain("onBought");
  });
});

describe("public surface routes", () => {
  it("does not hide About sections until an intersection observer runs", () => {
    const about = read("src/components/about/AboutContent.tsx");
    expect(about).not.toContain("translate-y-6 opacity-0");
    expect(about).not.toContain("new IntersectionObserver");
    expect(about).toContain("Who We Are");
    expect(about).toContain("Send us a message");
  });

  it("publishes /docs and /blog as public pages in middleware and the sitemap", () => {
    const middleware = read("src/middleware.ts");
    const sitemap = read("src/app/sitemap.ts");
    for (const route of ['"/docs"', '"/blog"']) {
      expect(middleware).toContain(route);
      expect(sitemap).toContain(route);
    }
    expect(read("src/app/docs/page.tsx")).toContain("/how-it-works");
    expect(read("src/app/docs/page.tsx")).toContain("/ai-disclaimer");
    expect(read("src/app/docs/page.tsx")).toContain("/pricing#faq");
    expect(read("src/app/blog/page.tsx")).toContain("/market-news");
    expect(middleware).toContain('"/market-news"');
    expect(read("src/app/blog/page.tsx")).toContain("no articles");
  });

  it("uses the shared site header on About and prompts signed-out dashboard clicks", () => {
    const about = read("src/components/about/AboutContent.tsx");
    expect(about).toContain("SiteHeader");
    expect(about).not.toContain("Try the AI");
    expect(about).not.toContain("Toggle menu");
    const prompt = read("src/components/dashboard/MemberDashboardPrompt.tsx");
    expect(prompt).toContain(
      "Dashboard is part of the service available to signed up members — You can sign up right now for free by clicking the link",
    );
    expect(prompt).toContain('"/pricing"');
    expect(read("src/components/TopNav.tsx")).toContain("onDashboardClick");
    expect(read("src/components/home/HomeSessionCtas.tsx")).toContain("onDashboardClick");
    expect(read("src/components/dashboard/GuestDashboardGate.tsx")).toContain("MemberDashboardDialog");
    expect(read("src/components/dashboard/GuestDashboardGate.tsx")).not.toContain("Test UserAF");
  });
});
