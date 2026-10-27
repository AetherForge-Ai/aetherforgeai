/**
 * DASH-CLEAN-E b84. pull-check:v3-b87-2026-10-28
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

describe("DASH-CLEAN-E b84", () => {
  it("pins the build", () => {
    expect(read("public/build-version.txt").trim()).toBe("v3-b87-2026-10-28");
    expect(read("qa/PULL-CHECK-2026-10-12.md")).toContain("pull-check:v3-b87-2026-10-28");
  });

  it("Crypto Market trigger is visible by default and collapsed content is inert", () => {
    expect(read("src/components/dashboard/DashboardInsights.tsx")).toContain('title="Institutional Crypto Terminal" icon={LineChart} defaultOpen');
    expect(read("src/components/dashboard/CollapsibleSection.tsx")).toContain("inert={!open}");
  });

  it("44px tap height on phones for How the books work, Tax papers and footer links", () => {
    const t = "inline-flex min-h-11 items-center md:min-h-0";
    expect(read("src/components/legal/DisclaimerNotice.tsx")).toContain(t);
    expect(read("src/components/dashboard/IncomeTaxPanel.tsx")).toContain(t);
    expect(read("src/components/SiteFooter.tsx")).toContain(t);
    expect(read("src/components/SiteFooter.tsx")).toContain("[&>a]:min-h-11");
    expect(read("src/components/CookieSettingsLink.tsx")).toContain(t);
  });

  it("a11y: no aria-label on KPI spans, decorative logo alt", () => {
    const kpi = read("src/components/dashboard/KpiHeader.tsx");
    expect(kpi).not.toContain("aria-label={`${label} ${full}`}");
    expect(kpi).toContain('<span className="sr-only">{`${label} ${full}`}</span>');
    expect(read("src/components/BrandLogo.tsx")).toContain('alt={showWordmark ? "" : "AetherForge AI"}');
  });

  it("CLS: ticker footer reserves two lines on phones", () => {
    expect(read("src/components/MarketTicker.tsx")).toContain("min-h-[4.5rem]");
  });

  it("/settings reads the plan from /api/account/plan and never upgrades to the same tier", () => {
    const s = read("src/components/settings/SettingsClient.tsx");
    expect(s).toContain('fetch("/api/account/plan"');
    expect(s).toContain("const isUpgrade = !sameTier && plan.price > currentPrice;");
    expect(s).toContain("data-current-plan");
  });
});
