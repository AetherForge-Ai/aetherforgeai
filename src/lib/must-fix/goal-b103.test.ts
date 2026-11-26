// pull-check:v3-b104-2026-11-27
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { checkReleaseGate } from "@/lib/release-gate";
import { BUILD_RELEASE_ID } from "@/lib/goal-test-hooks";

/** b103: release marker. READY stays refused until a preview-b103 grade exists. */
const read = (p: string) => readFileSync(p, "utf8");
const VERSION = "v3-b104-2026-11-27";

function buildNumber(id: string): number {
  const m = /^v3-b(\d+)/.exec(id);
  if (!m) throw new Error(`not a build id: ${id}`);
  return Number(m[1]);
}

describe("b103", () => {
  it("pins the build id", () => {
    expect(read("public/build-version.txt").trim()).toBe(VERSION);
    expect(BUILD_RELEASE_ID).toBe(read("public/build-version.txt").trim());
    expect(read("qa/PULL-CHECK-2026-10-12.md")).toContain(`pull-check:${VERSION}`);
    expect(read("qa/PULL-CHECK-2026-10-12.md")).toContain("AI-CHAT-SIGNALS-2 (PR692)");
    expect(read("qa/PULL-CHECK-2026-10-12.md")).toContain("H-10-UNDO-SERVER-BATCH (PR697)");
    expect(read("qa/PULL-CHECK-2026-10-12.md")).toContain("DAILY-PRICES-1 (PR694)");
    expect(read("src/lib/chat-signals.ts")).toContain("export function signalReplyStaysOnRows");
    expect(read("src/lib/import-batches.ts")).toContain("export function listImportBatches");
    expect(read("src/lib/daily-price-capture.ts")).toContain("export function captureBudgetFromEnv");
  });

  it("b103 is a newer build number than b102", () => {
    expect(buildNumber("v3-b104-2026-11-27")).toBeGreaterThan(buildNumber("v3-b102-2026-11-15"));
    expect(["b102", "b103"].sort()).toEqual(["b102", "b103"]);
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

  it("has no READY marker and no preview-b103 grade", () => {
    expect(existsSync("goal-loop/READY_TO_PUBLISH")).toBe(false);
    expect(readdirSync("goal-loop").some((n) => n === "preview-b103.md" || (n.startsWith("preview-b103-") && n.endsWith(".md")))).toBe(false);
    const r = checkReleaseGate({ read: (p) => (existsSync(p) ? read(p) : null), list: (d) => readdirSync(d) });
    expect(r).toEqual({ ok: true, ready: false });
  });

  it("dry run: marking this build READY is blocked until a preview-b103 grade exists", () => {
    const r = checkReleaseGate({ read: (p) => (p === "goal-loop/READY_TO_PUBLISH" ? `${VERSION}\n` : existsSync(p) ? read(p) : null), list: (d) => readdirSync(d) });
    expect(r).toEqual({ ok: false, reason: `No TT preview grade file goal-loop/preview-b104.md or preview-b104-*.md for ${VERSION}.` });
  });
});
