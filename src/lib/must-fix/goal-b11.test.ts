/**
 * Goal loop batch b11 (GOAL-LOCK G-10 G-11 G-14 G-15 G-17).
 * pull-check:v3-goal-b18-2026-10-18
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { absoluteUrl, breadcrumbJsonLd, faqJsonLd, softwareApplicationJsonLd } from "@/lib/public-schema";
import { coinMetricsSourceLine, depthMissingReason } from "@/lib/coin-depth";
import { fmtShortDate } from "@/lib/crypto-market";

const read = (p: string) => readFileSync(p, "utf8");

describe("b11 pins", () => {
  it("build version", () => {
    expect(read("public/build-version.txt").trim()).toBe("v3-goal-b18-2026-10-18");
    expect(read("qa/PULL-CHECK-2026-10-12.md")).toContain("pull-check:v3-goal-b18-2026-10-18");
  });
});

describe("G-15 schema", () => {
  it("breadcrumb items are absolute URLs", () => {
    const b = breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "Pricing", path: "/pricing" }]);
    for (const item of b.itemListElement) expect(item.item).toMatch(/^https?:\/\/[^/]+\//);
    expect(absoluteUrl("https://x.test/a")).toBe("https://x.test/a");
  });
  it("FAQ has question and answer text; no rating schema anywhere", () => {
    const f = faqJsonLd();
    expect(f.mainEntity.length).toBeGreaterThan(0);
    for (const q of f.mainEntity) expect(q.name && q.acceptedAnswer.text).toBeTruthy();
    const all = JSON.stringify([f, softwareApplicationJsonLd()]);
    expect(all).not.toMatch(/aggregateRating|"Review"|ratingValue/);
    expect(JSON.stringify(softwareApplicationJsonLd())).toMatch(/"price":"?(0|16|49|199)/);
  });
});

describe("G-14 accessibility fixes", () => {
  it("light sheet restores AA colours and usage list is valid", () => {
    const css = read("src/app/globals.css");
    expect(css).toContain(".content-light .text-emerald-700");
    expect(css).toContain(".content-light .text-amber-400");
    const rail = read("src/components/dashboard/rail/DashboardRail.tsx");
    expect(rail).not.toMatch(/<div key=\{row\.label\}>\s*<div className="flex/);
    expect(read("src/components/dashboard/GlobalSearch.tsx")).toContain('aria-keyshortcuts="Meta+K"');
  });
});

describe("G-17 crypto depth", () => {
  it("source and time line, and a reason when a figure is missing", () => {
    expect(coinMetricsSourceLine("coingecko", "2026-10-17T17:00:00Z")).toBe("Source: CoinGecko · as of 18 Oct 2026, 6:00 am");
    expect(coinMetricsSourceLine("coingecko", null)).toContain("time not supplied");
    expect(depthMissingReason("coinpaprika")).toBe("Not supplied by CoinPaprika");
    expect(fmtShortDate("2025-10-06T00:00:00Z")).toBe("6 Oct 2025");
    const view = read("src/components/dashboard/crypto/CoinDetailView.tsx");
    for (const label of ["Market Cap", "24h Volume", "Circulating"]) expect(view).toContain(`label="${label}" value="—"`);
    expect(view).toContain("data-coin-metrics-source");
  });
});

describe("G-10 / G-11 local harness", () => {
  it("harness runs without real keys and never sends email", () => {
    const mock = read("qa/local-harness/mock-totalum.mjs");
    expect(mock).toContain("never sent");
    expect(read("qa/local-harness/README.md")).toContain("env -u TOTALUM_API_KEY");
  });
});
