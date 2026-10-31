/** b95 GATE-1: READY_TO_PUBLISH needs a linked TT preview grade with 0 P0 and 0 P1. Runs on the repo in CI. */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkReleaseGate, type GateFiles } from "@/lib/release-gate";

const repo: GateFiles = {
  read: (p) => (existsSync(p) ? readFileSync(p, "utf8") : null),
  list: (d) => (existsSync(d) ? readdirSync(d) : []),
};

function fake(map: Record<string, string>): GateFiles {
  return {
    read: (p) => (p in map ? map[p] : null),
    list: (d) => Object.keys(map).filter((k) => k.startsWith(`${d}/`)).map((k) => k.slice(d.length + 1)),
  };
}
const V = "public/build-version.txt";

describe("GATE-1 release gate", () => {
  it("this repo passes the gate (a READY marker, if any, has a passing TT grade)", () => {
    const r = checkReleaseGate(repo);
    expect(r.ok, r.ok ? "" : r.reason).toBe(true);
  });
  it("no marker: not READY, passes", () => {
    expect(checkReleaseGate(fake({ [V]: "v3-b95-2026-11-01\n" }))).toEqual({ ok: true, ready: false });
  });
  it("marker without a grade file is blocked", () => {
    const r = checkReleaseGate(fake({ [V]: "v3-b95-2026-11-01", "goal-loop/READY_TO_PUBLISH": "v3-b95-2026-11-01\n" }));
    expect(r.ok).toBe(false);
  });
  it("marker for a different build than build-version.txt is blocked", () => {
    const r = checkReleaseGate(fake({ [V]: "v3-b95-2026-11-01", "goal-loop/READY_TO_PUBLISH": "v3-b94-2026-11-01", "goal-loop/preview-b94-tt.md": "v3-b94-2026-11-01\nP0: 0\nP1: 0" }));
    expect(r.ok).toBe(false);
  });
  it("a grade with any P0 or P1, or no counts, is blocked", () => {
    for (const body of ["P0: 0\nP1: 2", "P0: 1\nP1: 0", "all good"]) {
      const r = checkReleaseGate(fake({ [V]: "v3-b95-2026-11-01", "goal-loop/READY_TO_PUBLISH": "v3-b95-2026-11-01", "goal-loop/preview-b95-tt.md": `Build v3-b95-2026-11-01\n${body}` }));
      expect(r.ok, body).toBe(false);
    }
  });
  it("a grade for another build number does not count", () => {
    const r = checkReleaseGate(fake({ [V]: "v3-b95-2026-11-01", "goal-loop/READY_TO_PUBLISH": "v3-b95-2026-11-01", "goal-loop/preview-b951-tt.md": "v3-b95-2026-11-01\nP0: 0\nP1: 0" }));
    expect(r.ok).toBe(false);
  });
  it("a grade naming the build with P0: 0 and P1: 0 passes as READY", () => {
    const r = checkReleaseGate(fake({ [V]: "v3-b95-2026-11-01", "goal-loop/READY_TO_PUBLISH": "v3-b95-2026-11-01", "goal-loop/preview-b95-2026-11-01.md": "# TT preview grade v3-b95-2026-11-01\n- **P0**: 0\n- **P1**: 0\n- P2: 3" }));
    expect(r).toEqual({ ok: true, ready: true, grade: "goal-loop/preview-b95-2026-11-01.md" });
  });
});
