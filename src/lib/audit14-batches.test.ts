import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AI_PROVIDER_API_SENTENCE } from "@/lib/ai-provider-disclosure";
import { CHANGELOG_ENTRIES } from "@/lib/changelog-entries";
import { publicAsOfPhrase, publicCryptoTableLines } from "@/lib/crypto-price-chain";
import { honeypotFilled, resetRateLimits, takeRateLimit } from "@/lib/ip-rate-limit";
import { tapeUpdatedPhrase } from "@/lib/market-freshness";
import { aetherforgePriceIds, publicCheckoutPriceIds } from "@/lib/plans";
import { PROJECTIONS_MEMBER_LINE, ULTIMATE_PRICE_PENDING_D6 } from "@/lib/public-copy";
import { priceUpdatedPhrase } from "@/components/PriceConfidenceBadge";
import { fiftyTwoWeekLine, headlinesForSymbol, NEWS_MISSING, sectorLine, sparklinePoints } from "@/lib/stock-public-facts";
import sitemap from "@/app/sitemap";

function read(rel: string) {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

describe("audit 14 Oct batches A–D", () => {
  it("C1 lists only AetherForge plan price ids", () => {
    const ids = aetherforgePriceIds();
    expect(ids).toContain("price_1UMeiw9sOmzarzYktK1su69w");
    expect(ids).toContain("price_1TsjfJ9sOmzarzYkM1QYb3tU");
    expect(ids.every((id) => id.startsWith("price_"))).toBe(true);
    const route = read("src/app/api/stripe/products/route.ts");
    expect(route).toContain("publicCheckoutPriceIds");
    expect(publicCheckoutPriceIds().every((id) => ids.includes(id))).toBe(true);
    expect(route).not.toContain("products.list");
    expect(route).not.toContain("createProductsInStripe");
  });

  it("C2 caps and limits the public guide and the contact form", async () => {
    resetRateLimits();
    for (let i = 0; i < 10; i += 1) expect((await takeRateLimit("guide-test", 10, 60_000, 1_000)).allowed).toBe(true);
    expect((await takeRateLimit("guide-test", 10, 60_000, 1_000)).allowed).toBe(false);
    expect(honeypotFilled("http://spam.example")).toBe(true);
    expect(honeypotFilled("  ")).toBe(false);
    expect(honeypotFilled(undefined)).toBe(false);
    const guide = read("src/app/api/personal-guide/route.ts");
    expect(guide).toContain("PERSONAL_GUIDE_LIMIT");
    expect(guide).toContain("PUBLIC_INPUT_CAP");
    expect(guide).toContain("limited: true");
    const contact = read("src/app/api/contact/route.ts");
    expect(contact).toContain("CONTACT_LIMIT");
    expect(contact).toContain("honeypotFilled");
    expect(read("src/components/about/AboutContent.tsx")).toContain('name="website"');
  });

  it("M9 keeps payment and invoice webhook handlers as logs", () => {
    const webhook = read("src/app/api/stripe/webhook/route.ts");
    expect(webhook).not.toContain("TODO: Store payment");
    expect(webhook).not.toContain("TODO: Store failed payment");
    expect(webhook).toContain("payment_intent.succeeded (log only)");
    expect(webhook).toContain("invoice.paid (log only)");
  });

  it("H1 keeps changelog and status free of SHAs and internal labels", () => {
    const blob = CHANGELOG_ENTRIES.map((entry) => `${entry.title} ${entry.body}`).join("\n");
    expect(blob).not.toMatch(/\bDevelop [0-9a-f]{6,}\b/);
    expect(blob).not.toMatch(/\b[0-9a-f]{7,40}\b/);
    expect(blob.toLowerCase()).not.toContain("develop");
    expect(blob.toLowerCase()).not.toContain("admin diagnostics");
    expect(read("src/app/status/page.tsx")).not.toContain("develop history");
    expect(read("src/app/status/page.tsx")).toContain("dated notes");
  });

  it("H2 and M8 format tape stamps and label a shut market as Close", () => {
    const shut = new Date("2026-10-14T15:52:00.000Z");
    expect(tapeUpdatedPhrase("2026-10-13T04:00:00.000Z", "NZX", shut)).toBe("Close 13 Oct 2026");
    expect(priceUpdatedPhrase("2026-10-13T04:00:00.000Z")).toBe("last updated 13 Oct 2026, 5:00 pm");
    expect(read("src/components/MarketTicker.tsx")).not.toContain("A price shows here after the feed returns a figure.");
    expect(read("src/components/MarketTicker.tsx")).toContain('aria-busy="true"');
  });

  it("H3 does not prefix Prices as at with as of", () => {
    const clock = "Prices as at 14 Oct 2026, 3:45 am (NZ).";
    expect(publicAsOfPhrase(clock)).toBe(clock);
    const lines = publicCryptoTableLines({
      id: "CRYPTO",
      asOf: clock,
      rows: [{ symbol: "BTC", name: "Bitcoin", price: "US$83,645.00", change: "+1%", href: "/markets/crypto/bitcoin" }],
    });
    expect(lines[0]).toBe(`BTC US$83,645.00 ${clock}`);
    expect(lines[0]).not.toContain("as of Prices as at");
  });

  it("H5 H6 H7 L1 and L5 clean the public copy", () => {
    const howTo = read("src/app/how-to-maximize-results/page.tsx");
    expect(howTo).not.toContain("consistently report");
    expect(howTo).not.toContain("Apex report");
    expect(howTo).not.toContain("Buy");
    expect(AI_PROVIDER_API_SENTENCE.startsWith("Plain-English notes are written by a third-party AI service, xAI (Grok)")).toBe(true);
    expect(AI_PROVIDER_API_SENTENCE).not.toContain("in those sentences");
    expect(read("src/lib/bot-guides.ts")).not.toContain("does not name the model");
    expect(read("src/components/about/AboutContent.tsx")).not.toContain("Freshly Launched 2026");
    expect(read("src/lib/public-copy.ts")).not.toContain("TODO: restore phone when 0800 live");
  });

  it("H8 and H9 leave D1 and D6 and show the two-month saving", () => {
    expect(PROJECTIONS_MEMBER_LINE).toContain("signed-in members");
    expect(PROJECTIONS_MEMBER_LINE).toContain("not advice");
    expect(PROJECTIONS_MEMBER_LINE).toContain("Crypto projections stay paused");
    expect(read("src/lib/public-copy.ts")).not.toContain("PROJECTIONS_COPY_PENDING_D1");
    expect(ULTIMATE_PRICE_PENDING_D6).toBe(false);
    expect(read("src/lib/plans.ts")).toContain("monthlyPrice: 199");
    expect(read("src/lib/plans.ts")).toContain("yearlyPrice: 1990");
    expect(read("src/components/pricing/PricingCards.tsx")).toContain("Save 2 months (≈17%)");
    expect(read("src/components/pricing/PricingCards.tsx")).not.toContain("Save ~");
    expect(read("src/app/help/page.tsx")).toContain("admin@aetherforgeai.co.nz");
  });

  it("H10 M1 M4 and M13 enrich stock pages, cap the markets document, and label images", () => {
    expect(sectorLine("Materials")).toBe("Materials");
    expect(sectorLine("Not stated")).toContain("—");
    expect(fiftyTwoWeekLine(null, 10, "NZD")).toContain("—");
    expect(fiftyTwoWeekLine(4, 6, "NZD")).toContain("NZ$");
    expect(sparklinePoints([1])).toBeNull();
    expect(sparklinePoints([1, 2])).toContain(",");
    expect(headlinesForSymbol([{ headline: "Fletcher Building rises", summary: "" }], "FBU.NZ")).toEqual([]);
    // r11: a ticker counts only in ticker form (FBU.NZ, NZX:FBU, (FBU)).
    expect(headlinesForSymbol([{ headline: "FBU updates guidance", summary: "" }], "FBU")).toEqual([]);
    expect(headlinesForSymbol([{ headline: "FBU.NZ updates guidance", summary: "" }], "FBU")).toEqual(["FBU.NZ updates guidance"]);
    expect(NEWS_MISSING.startsWith("—")).toBe(true);
    expect(read("src/app/markets/stock/[ticker]/page.tsx")).toContain("StockPublicFacts");
    expect(read("src/lib/public-market-types.ts")).toContain("PUBLIC_SEED_ROWS = 25");
    expect(read("src/lib/public-market-index.ts")).toContain("DOCUMENT_ROWS");
    const paths = new Set(sitemap().map((row) => new URL(row.url).pathname));
    expect(paths.has("/headmaster")).toBe(true);
    expect(paths.has("/blog")).toBe(false);
    expect(read("src/app/blog/page.tsx")).toContain("index: false");
    expect(read("src/components/dashboard/NewsFeed.tsx")).toContain("Illustration for");
    expect(read("src/app/page.tsx")).not.toMatch(/alt=""/);
  });

  it("M3 M6 M12 and M2 stay inside the allowed files", () => {
    expect(read("src/components/personal-guide/PersonalGuide.tsx")).toContain("next/dynamic");
    expect(read("src/components/portfolio-coach/PortfolioCoach.tsx")).toContain("next/dynamic");
    expect(read("src/components/dashboard/StockAssetPage.tsx")).toContain("next/dynamic");
    expect(read("src/components/legal/DisclaimerNotice.tsx")).toContain("ONE_LINE_DISCLAIMER");
    expect(read("src/app/register/page.tsx")).toContain('aria-label="I am 18 or over');
    expect(read("src/lib/private-document.ts")).toContain("TODO(M2)");
    expect(read("src/lib/private-document.ts")).toContain("bypasses on the auth cookie");
    expect(read("src/app/my-returns/page.tsx")).toContain("Money-weighted return");
  });
});
