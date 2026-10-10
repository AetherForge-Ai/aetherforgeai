import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import sitemap from "@/app/sitemap";
import { AI_REQUEST_LINES, AI_SENT_CATEGORIES } from "@/lib/public-copy";
import { changeIsFlat, sessionChangePct } from "@/lib/yahoo-finance";
import { publicTickerPaths } from "@/lib/sitemap-tickers";

function read(rel: string) {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

describe("Track B P0", () => {
  it("shows both contact emails on footer, About, Terms, Privacy and Trust", () => {
    for (const rel of [
      "src/components/SiteFooter.tsx",
      "src/components/about/AboutContent.tsx",
      "src/app/terms-of-service/page.tsx",
      "src/app/privacy-policy/page.tsx",
      "src/app/trust/page.tsx",
    ]) {
      const text = read(rel);
      expect(text.includes("admin@aetherforgeai.co.nz") || text.includes("CUSTOMER_EMAIL"), rel).toBe(true);
      expect(text.includes("lukas@aetherforgeai.co.nz") || text.includes("PRIVACY_OFFICER_EMAIL"), rel).toBe(true);
    }
    const copy = read("src/lib/public-copy.ts");
    expect(copy).toContain("admin@aetherforgeai.co.nz");
    expect(copy).toContain("lukas@aetherforgeai.co.nz");
    expect(read("src/app/terms-of-service/page.tsx")).toContain("PUBLIC_PHONE_DISPLAY");
    expect(copy).toContain("0800 238 437");
    expect(read("src/components/SiteFooter.tsx")).toContain('href: "/status"');
    expect(read("src/lib/public-copy.ts")).toContain("pull-check:track-b-p0-2026-10-11");
    expect(read("src/lib/company.ts")).toContain("pull-check:address-removed-2026-10-11");
    expect(read("src/lib/company.ts")).not.toContain("REGISTERED_OFFICE");
    expect(read("src/components/SiteFooter.tsx")).not.toContain("REGISTERED_OFFICE");
    expect(read("src/components/about/AboutContent.tsx")).not.toContain("REGISTERED_OFFICE");
    expect(read("src/components/about/AboutContent.tsx")).not.toContain("Registered office");
    expect(read("src/app/layout.tsx")).not.toContain("streetAddress");
    expect(read("src/app/layout.tsx")).not.toContain("PostalAddress");
    const town = ["Peg", "asus"].join("");
    const street = ["Lake", "side"].join("");
    const postcode = ["76", "12"].join("");
    for (const rel of [
      "src/lib/company.ts",
      "src/components/SiteFooter.tsx",
      "src/components/about/AboutContent.tsx",
      "src/app/layout.tsx",
      "src/app/terms-of-service/page.tsx",
      "src/app/privacy-policy/page.tsx",
      "src/app/trust/page.tsx",
    ]) {
      const text = read(rel);
      expect(text.includes(town), rel).toBe(false);
      expect(text.includes(street), rel).toBe(false);
      expect(text.includes(postcode), rel).toBe(false);
    }
  });

  it("keeps the removed address out of tracked files", () => {
    const town = ["Peg", "asus"].join("");
    const street = ["Lake", "side"].join("");
    const postcode = ["76", "12"].join("");
    for (const word of [town, street, postcode]) {
      let listed = "";
      try {
        listed = execFileSync("git", ["grep", "-i", "-l", "-F", "--", word], { encoding: "utf8" });
      } catch (error) {
        const failed = error as { status?: number; stdout?: string };
        if (failed.status !== 1) throw error;
        listed = failed.stdout ?? "";
      }
      const files = listed
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      expect(files, word).toEqual([]);
    }
  });

  it("keeps the status page free of a fake uptime line", () => {
    const status = read("src/app/status/page.tsx");
    expect(status).toContain("Status updates are posted here.");
    expect(status).toContain('href: "/trust"');
    expect(status).toContain('href: "/changelog"');
    expect(status).not.toContain("All systems normal");
  });

  it("lists 10 Oct 2026 and 11 Oct 2026 changelog lines from develop, and no 9 Oct line", () => {
    const page = read("src/app/changelog/page.tsx");
    expect(page).toContain("11 Oct 2026");
    expect(page).toContain("87dfce1");
    expect(page).toContain("caa5472");
    expect(page).toContain("10 Oct 2026");
    expect(page).toContain("e9afcf5");
    expect(page).not.toContain("9 Oct 2026");
    expect(page).not.toMatch(/GST/i);
  });

  it("puts ticker paths and /status on the sitemap", () => {
    const rows = sitemap();
    const paths = new Set(rows.map((row) => new URL(row.url).pathname));
    expect(paths.has("/status")).toBe(true);
    expect(paths.has("/changelog")).toBe(true);
    const tickers = publicTickerPaths();
    expect(tickers.some((href) => href.startsWith("/markets/stock/"))).toBe(true);
    expect(tickers.some((href) => href.startsWith("/markets/crypto/"))).toBe(true);
    expect(paths.has(tickers[0])).toBe(true);
  });

  it("prints a change figure on each ticker cell", () => {
    const ticker = read("src/components/MarketTicker.tsx");
    expect(ticker).toContain("formatSignedPercent(q.change)");
    expect(ticker).not.toContain("No change figure");
    expect(changeIsFlat(0)).toBe(true);
    expect(changeIsFlat(1.25)).toBe(false);
    expect(sessionChangePct(110, 100)).toBeCloseTo(10);
    expect(sessionChangePct(100, 0)).toBeNull();
  });

  it("states only the public AI facts, with no model name", () => {
    const trust = read("src/app/trust/page.tsx");
    const privacy = read("src/app/privacy-policy/page.tsx");
    expect(trust).toContain("AI_REQUEST_LINES");
    expect(privacy).toContain("AI_REQUEST_LINES");
    const blob = [
      trust,
      privacy,
      read("src/lib/public-copy.ts"),
      read("src/components/chat/ChatAssistant.tsx"),
      read("src/components/dashboard/TickerAnalysisPane.tsx"),
      read("src/components/trial/TrialReportView.tsx"),
    ].join("\n");
    expect(blob).toMatch(/third-party AI service/);
    expect(blob).toContain("AI-written note");
    expect(blob).toContain("holding count");
    expect(blob).toContain("cash balance");
    expect(blob).toContain("retained-cash target");
    expect(blob).toContain("stress-test impacts in NZ$ and percent");
    expect(blob).toContain("does not include a card number");
    expect(blob).not.toMatch(/\b(Grok|xAI|ZENITH|ULTRA|grok-4|enhanceWithGrok)\b/);
    const note = read("docs/ai-disclosure-for-lukas-2026-10-11.md");
    expect(note).toContain("to be confirmed by Lukas");
    expect(note).toContain("the trial summary function in src/lib/trial-report.ts");
    expect(note).not.toMatch(/\b(Grok|xAI|ZENITH|ULTRA|grok-4|enhanceWithGrok)\b/);
    const markets = read("src/lib/public-market-index.ts");
    expect(markets).toContain("const EQUITY_BUDGET_MS = 3000");
    expect(markets).toContain("const REFRESH_BACKOFF_MS = 60 * 1000");
    expect(markets).toContain("refreshes in the background");
    expect(markets).toContain("Date.now() >= nextRefreshAt");
    const stock = read("src/app/markets/stock/[ticker]/page.tsx");
    expect(stock).toContain("Create a free account");
    expect(stock).toContain("Add to your paper book");
    expect(stock).toContain("listing.entry.sector");
  });

  it("names every category the completion routes send", () => {
    const lines = AI_REQUEST_LINES.join("\n");
    for (const [endpoint, categories] of Object.entries(AI_SENT_CATEGORIES)) {
      for (const category of categories) {
        expect(lines, `${endpoint} missing “${category}”`).toContain(category);
      }
    }
    expect(lines).toContain("does not include a card number");
    expect(lines).toContain("does not set a retention period");
    expect(lines).not.toMatch(/\b(Grok|xAI|ZENITH|ULTRA|grok-4|enhanceWithGrok)\b/);
  });

  it("keeps the licensing note as options and does not claim a licence", () => {
    const note = read("docs/data-licensing-options-2026-10-11.md");
    expect(note).toContain("Lukas decides");
    expect(note).toContain("does not claim that AetherForge holds an NZX licence");
    expect(note).not.toMatch(/we hold an? (NZX|ASX) licence/i);
    expect(note).not.toMatch(/GST/i);
  });
});
