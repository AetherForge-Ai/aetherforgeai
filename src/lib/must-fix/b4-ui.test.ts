import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { isEmptyBook, TAB_EMPTY_COPY } from "@/components/dashboard/TabEmptyState";
import { RAIL_CARD_CLASS } from "@/components/dashboard/rail/RailCard";

const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");

describe("M-8 empty states", () => {
  it("every dashboard tab has copy and no figures", () => {
    for (const tab of ["holdings", "transactions", "income", "insights"]) {
      expect(TAB_EMPTY_COPY[tab].title).toMatch(/^No /);
      expect(TAB_EMPTY_COPY[tab].body).not.toMatch(/\d/);
    }
  });
  it("empty only with no positions and no ledger rows; unknown while loading", () => {
    expect(isEmptyBook(null)).toBe(false);
    expect(isEmptyBook({ groups: [{ positions: [] }], ledger: [] })).toBe(true);
    expect(isEmptyBook({ groups: [{ positions: [{}] }], ledger: [] })).toBe(false);
    expect(isEmptyBook({ groups: [], ledger: [{}] })).toBe(false);
  });
  it("the CTA says Add your first holding", () => {
    expect(read("src/components/dashboard/PortfolioDashboard.tsx")).toContain(">Add your first holding</Button>");
    expect(read("src/components/dashboard/DashboardCalculator.tsx")).toContain("<TabEmptyState tab={tab} action={emptyActions} />");
  });
});

describe("M-6 right column", () => {
  it("cards carry the shadow token; numbers sit on one line; Guide clearance", () => {
    expect(RAIL_CARD_CLASS).toContain("shadow-soft");
    expect(read("src/components/dashboard/UnifiedHoldingsTable.tsx")).toContain('"whitespace-nowrap text-right"');
    expect(read("src/app/globals.css")).toMatch(/\[data-section="dashboard-workspace"\] \{\s*padding-bottom: 5\.5rem;/);
  });
});

describe("M-5 names and Apex", () => {
  it("MPG.NZ has one name and the list name wins over the feed", async () => {
    const { canonicalTickerName } = await import("@/lib/market-intel");
    expect(canonicalTickerName("mpg.nz", "Metro Performance Glass Limited")).toBe("Metro Performance Glass");
    expect(canonicalTickerName("ZZZ.NZ", "Feed Name")).toBe("Feed Name");
    const { execSync } = await import("node:child_process");
    expect(execSync("grep -rl 'Metroglass' src --exclude=b4-ui.test.ts || true", { encoding: "utf8" }).trim()).toBe("");
  });
  it("Apex is only a legacy-plan label in rendered copy; engine lives in bot-report", () => {
    expect(read("src/lib/apex.ts")).toContain('export * from "@/lib/bot-report"');
    expect(read("src/app/pricing/page.tsx")).toContain(">Legacy plan: Apex Dual</h2>");
    expect(read("src/components/bots/BotShowcase.tsx")).not.toContain("in Apex Mode");
  });
});

describe("M-7 contrast tokens", () => {
  it("one green for primary; AA muted text", () => {
    const css = read("src/app/globals.css");
    expect(css).not.toContain("#059669");
    expect(css).toMatch(/--primary: #047857/);
    expect(css).not.toMatch(/--muted-foreground: #64748b/);
    expect(css).toMatch(/\.chrome-dark \.text-emerald-700 \{\s*color: #34d399;/);
  });
});
