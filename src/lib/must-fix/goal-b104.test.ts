// pull-check:v3-b104-2026-11-27
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { checkReleaseGate } from "@/lib/release-gate";
import { BUILD_RELEASE_ID } from "@/lib/goal-test-hooks";

/** b104: release marker. READY stays refused until a preview-b104 grade exists. */
const read = (p: string) => readFileSync(p, "utf8");
const VERSION = "v3-b104-2026-11-27";

function buildNumber(id: string): number {
  const m = /^v3-b(\d+)/.exec(id);
  if (!m) throw new Error(`not a build id: ${id}`);
  return Number(m[1]);
}

describe("b104", () => {
  it("pins the build id", () => {
    expect(read("public/build-version.txt").trim()).toBe(VERSION);
    expect(BUILD_RELEASE_ID).toBe(read("public/build-version.txt").trim());
    expect(read("qa/PULL-CHECK-2026-10-12.md")).toContain(`pull-check:${VERSION}`);
    expect(read("qa/PULL-CHECK-2026-10-12.md")).toContain("COIN-MAP-1 (PR687)");
    expect(read("qa/PULL-CHECK-2026-10-12.md")).toContain("TAPE-STALE-CLOSE (PR700)");
    expect(read("qa/PULL-CHECK-2026-10-12.md")).toContain("TRUST-EXPLAINER-1 (PR702)");
    expect(read("qa/PULL-CHECK-2026-10-12.md")).toContain("NZ-CALC-1 (PR703)");
    expect(read("qa/PULL-CHECK-2026-10-12.md")).toContain("NZ-TAX-PREVIEW-1 (PR704, ships dark, flags OFF)");
    expect(read("qa/PULL-CHECK-2026-10-12.md")).not.toContain("PR701");
    expect(read("src/lib/crypto-listed-match.ts")).toContain("export function canonicalGeckoForTicker");
    expect(read("src/lib/market-freshness.ts")).toContain("export function tapeCloseIsPreviousSession");
    expect(read("src/lib/trust-money.ts")).toContain('export const TRUST_MONEY_HEADING = "Your money stays with you"');
    expect(read("src/lib/nz-investor-tools.ts")).toContain("export function fifCostPosition");
    expect(read("src/lib/feature-flags.ts")).toContain("export const NZ_TAX_K05_K06_SIGNED_OFF = false");
    expect(read("src/lib/nz-tax-preview.ts")).toContain("NZ-TAX-PREVIEW-1");
  });

  it("b104 is a newer build number than b103", () => {
    expect(buildNumber("v3-b104-2026-11-27")).toBeGreaterThan(buildNumber("v3-b103-2026-11-15"));
    expect(["b103", "b104"].sort()).toEqual(["b103", "b104"]);
    const newest = Math.max(
      ...readdirSync("src/lib/must-fix")
        .map((f) => /^goal-b(\d+)\.test\.ts$/.exec(f)?.[1])
        .filter((n): n is string => Boolean(n))
        .map(Number),
    );
    expect(newest).toBe(104);
    expect(newest).toBeGreaterThan(103);
    const version = read("public/build-version.txt").trim();
    const m = /^v3-(?:(?:goal|h1|g24|dedupe|g10|del404|fix|m7|cr6|g18|cr6b|dashclean|dashclean-d|dashclean-e)-)?b(\d+)[a-z]?-\d{4}-\d{2}-\d{2}$/.exec(version);
    expect(Number(m?.[1])).toBe(newest);
  });

  it("has no READY marker and no preview-b104 grade", () => {
    expect(existsSync("goal-loop/READY_TO_PUBLISH")).toBe(false);
    expect(readdirSync("goal-loop").some((n) => n === "preview-b104.md" || (n.startsWith("preview-b104-") && n.endsWith(".md")))).toBe(false);
    const r = checkReleaseGate({ read: (p) => (existsSync(p) ? read(p) : null), list: (d) => readdirSync(d) });
    expect(r).toEqual({ ok: true, ready: false });
  });

  it("dry run: marking this build READY is blocked until a preview-b104 grade exists", () => {
    const r = checkReleaseGate({ read: (p) => (p === "goal-loop/READY_TO_PUBLISH" ? `${VERSION}\n` : existsSync(p) ? read(p) : null), list: (d) => readdirSync(d) });
    expect(r).toEqual({ ok: false, reason: `No TT preview grade file goal-loop/preview-b104.md or preview-b104-*.md for ${VERSION}.` });
  });
});
