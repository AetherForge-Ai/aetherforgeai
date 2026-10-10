import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function read(rel: string) {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

const MODEL_NAME = /\b(SuperGrok|Grok|xAI|grok-4(?:\.\d+)?|Claude|Gemini|GPT-\d|gpt-4|ZENITH|ULTRA)\b/i;

/** Comments and import paths are not rendered. String literals and JSX still are. */
function visibleCopy(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .replace(/^\s*import\s[\s\S]*?from\s+["'][^"']+["'];?/gm, "")
    .replace(/\/(?:\\\/|[^/\n])+\/[gimsuy]*/g, "");
}

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
  "src/lib/trial-report.ts",
  "src/lib/product-note.ts",
  "src/app/free-trial/page.tsx",
  "src/app/api/free-trial/run/route.ts",
  "src/components/TopNav.tsx",
  "src/components/dashboard/YearlyToolkit.tsx",
];

describe("public copy does not name a model", () => {
  it("says AI on user-facing pages, reports, and metadata", () => {
    for (const rel of PUBLIC_COPY) {
      const text = visibleCopy(read(rel));
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

describe("public surface routes", () => {
  it("does not hide About sections until an intersection observer runs", () => {
    const about = read("src/components/about/AboutContent.tsx");
    expect(about).not.toContain("translate-y-6 opacity-0");
    expect(about).not.toContain("new IntersectionObserver");
    expect(about).toContain("Who We Are");
    expect(about).toContain("Send us a message");
  });

  it("keeps /docs public and leaves /blog out of the sitemap until there are posts", () => {
    const gate = read("src/lib/route-gate.ts");
    const sitemap = read("src/app/sitemap.ts");
    expect(gate).toContain('"/docs"');
    expect(gate).toContain('"/blog"');
    expect(sitemap).toContain('"/docs"');
    expect(sitemap).not.toContain('"/blog"');
    expect(read("src/app/docs/page.tsx")).toContain("/how-it-works");
    expect(read("src/app/docs/page.tsx")).toContain("/ai-disclaimer");
    expect(read("src/app/docs/page.tsx")).toContain("/pricing#faq");
    expect(read("src/app/docs/page.tsx")).not.toContain('href: "/blog"');
    expect(read("src/app/blog/page.tsx")).toContain("/market-news");
    expect(read("src/app/blog/page.tsx")).toContain("index: false");
    expect(gate).toContain('"/market-news"');
    expect(read("src/app/blog/page.tsx")).toContain("no articles");
    expect(sitemap).toContain('"/markets"');
    expect(sitemap).toContain('"/market-news"');
    expect(sitemap).toContain('"/tax"');
    expect(sitemap).toContain('"/how-it-works"');
    expect(sitemap).toContain('"/projections"');
    expect(sitemap).not.toContain('"/login"');
    expect(sitemap).not.toContain('"/register"');
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

  it("hides the public markets Buy column and does not offer a Smitty report", () => {
    const markets = read("src/components/dashboard/MarketsPageContent.tsx");
    expect(markets).toContain("allowBuy={false}");
    expect(markets).not.toContain("Strong Buy");
    expect(markets).not.toContain("Reduce");
    const explorer = read("src/components/dashboard/MarketsExplorer.tsx");
    expect(explorer).toContain("allowBuy &&");
    expect(explorer).not.toContain("CoinDetailModal");
    expect(explorer).not.toContain("StockDetailDialog");
    expect(explorer).toContain("explorerDetailHref");
    expect(read("src/components/dashboard/CryptoAssetPage.tsx")).toContain("Markets · Crypto");
    expect(read("src/components/dashboard/StockAssetPage.tsx")).toContain("stockBackHref");
    expect(read("src/app/markets/crypto/[id]/page.tsx")).toContain('sp.buy === "1"');
    expect(read("src/app/markets/stock/[ticker]/page.tsx")).toContain('sp.buy === "1"');
    expect(read("src/components/dashboard/crypto/CoinDetailView.tsx")).toContain("COIN_DETAIL_SOURCE_DOWN");
    expect(read("src/components/dashboard/crypto/CoinDetailView.tsx")).not.toMatch(/<!DOCTYPE|Unexpected token/);
    const dashboard = read("src/components/dashboard/AllMarkets.tsx");
    expect(dashboard).toContain("<MarketsExplorer");
    expect(dashboard).not.toContain("allowBuy={false}");
    const metals = read("src/components/dashboard/PreciousMetals.tsx");
    expect(metals).toContain("does not run a report");
    expect(metals).not.toContain("Run Smitty");
    const headmaster = read("src/components/totalum/TotalumConsole.tsx");
    expect(headmaster).toContain("target weight, not a holding");
    const guide = read("src/lib/personal-guide-knowledge.ts");
    expect(guide).toContain("no Smitty report");
  });

  it("shows Emailed only from delivery proof on the report payload", () => {
    const center = read("src/components/dashboard/ReportCenter.tsx");
    expect(center).toContain("reportPayloadWasEmailed");
    expect(center).not.toContain('r.emailed === "yes"');
  });
});
