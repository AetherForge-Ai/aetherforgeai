import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

describe("DASH-CLEAN PR A: dashboard headings and tap targets", () => {
  it("renders a visible H1 on the dashboard home", () => {
    const src = read("src/components/dashboard/PortfolioDashboard.tsx");
    expect(src).not.toContain("{isHome ? null : (\n          <h1");
    expect(src).toMatch(/<h1 className=\{isHome \?/);
  });

  it("keeps the command palette title inside the dialog content", () => {
    const src = read("src/components/ui/command.tsx");
    expect(src.indexOf("<DialogContent")).toBeLessThan(src.indexOf("<DialogHeader"));
  });

  it("gives each tab and empty state a heading", () => {
    expect(read("src/components/dashboard/DashboardCalculator.tsx")).toContain(">Holdings</h2>");
    expect(read("src/components/dashboard/TabEmptyState.tsx")).toContain("<h2");
  });

  it("does not repeat the AI research report heading inside Insights", () => {
    expect(read("src/components/dashboard/DashboardInsights.tsx")).toContain('scope="equity" nested />');
    expect(read("src/components/dashboard/AnalysisPanel.tsx")).toContain('nested ? "p" : "h2"');
  });

  it("uses 44px tabs and maths buttons on mobile", () => {
    expect(read("src/components/dashboard/DashboardCalculator.tsx")).toContain("min-h-11 shrink-0");
    expect(read("src/components/dashboard/ShowTheMaths.tsx")).toContain("size-11 shrink-0 md:-m-0.5 md:size-6");
  });
});
