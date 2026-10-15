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
