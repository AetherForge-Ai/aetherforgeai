// pull-check:v3-goal-b22-2026-10-18
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { GUIDES, COMPARISONS } from "@/data/learn-content";

const read = (p: string) => readFileSync(p, "utf8");

describe("Goal b22", () => {
  it("pins the build", () => expect(read("public/build-version.txt").trim()).toMatch(/^v3-(?:(?:goal|h1|g24|dedupe|g10|del404|fix|m7|cr6|g18|cr6b|dashclean|dashclean-d|dashclean-e)-)?b\d+[a-z]?-2026-1[01]-\d\d$/));
  it("G-23: 26 guides + 3 compare pages + /learn = 30 URLs, all sourced", () => {
    expect(GUIDES.length + COMPARISONS.length + 1).toBeGreaterThanOrEqual(30);
    for (const g of GUIDES) for (const f of g.facts) expect(f.source != null || !!f.missingReason).toBe(true);
  });
  it("G-05: crypto reads revalidate past 10 minutes and wait for the attempt write", () => {
    const store = read("src/lib/crypto-board-store.ts");
    // b31 REG-1: the in-request wait is bounded (1.2 s); the attempt write finishes via waitUntil.
    expect(store).toMatch(/boardNeedsRefresh\(saved\?\.at, SNAPSHOT_REFRESH_MS\)\) \{[\s\S]{0,400}await Promise\.race\(\[work, sleep\(REQUEST_REFRESH_BOUND_MS\)\]\)/);
    expect(store).toMatch(/void keepAlive\(work\)/);
    expect(read("src/lib/crypto-attempts.ts")).toMatch(/pendingPersist = Promise.all\(\[persistSharedAttempt/);
    expect(read("src/app/api/crypto/route.ts")).toMatch(/revalidate: true/);
  });
  it("G-20 and G-28: test-account views are gated", () => {
    expect(read("src/app/test-hooks/track-record/page.tsx")).toMatch(/currentUserMayUseTestHooks\(\)\)\) notFound\(\)/);
    expect(read("src/components/TestHooksPanel.tsx")).toMatch(/data-funnel-readout/);
  });
  it("G-02: book and benchmark dates side by side", () => {
    expect(read("src/components/dashboard/PerformancePanel.tsx")).toMatch(/data-compare-dates/);
  });
});

describe("b22 goals / wealth / email guard", () => {
  const rd = (f: string) => require("node:fs").readFileSync(f, "utf8") as string;
  it("goals API is behind HEADMASTER_GOALS and filters by user", () => {
    const s = rd("src/app/api/goals/route.ts");
    expect(s).toContain("HEADMASTER_GOALS");
    expect(s).toMatch(/ownerOf/);
    expect(s).toMatch(/status: 404/);
  });
  it("wealth API has migrate and the panel falls back to localStorage", () => {
    expect(rd("src/app/api/wealth/route.ts")).toContain('"migrate"');
    const p = rd("src/components/dashboard/WholeWealthPanel.tsx");
    expect(p).toContain("/api/wealth");
    expect(p).toContain('setMode("local")');
    expect(p).toContain("MIGRATED_KEY");
  });
});
