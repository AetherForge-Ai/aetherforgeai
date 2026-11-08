/**
 * b95 GATE-1: a release may only be marked READY_TO_PUBLISH when a TT preview grade file for
 * that build is in the repo and shows 0 P0 and 0 P1 findings. Repo-side only: the check reads
 * files and runs inside the unit test job, so CI goes red if the marker is added without a
 * passing grade. No marker means the build is not claimed READY, and the gate passes.
 *
 * Marker: goal-loop/READY_TO_PUBLISH, one line holding the build id (v3-bNN-yyyy-mm-dd).
 * Grade:  goal-loop/preview-bNN.md or goal-loop/preview-bNN-*.md (b96: both), which must name the build id and carry the lines
 *         "P0: 0" and "P1: 0".
 */
export const READY_MARKER = "goal-loop/READY_TO_PUBLISH";
export const GRADE_DIR = "goal-loop";

export interface GateFiles {
  /** Returns the file text, or null when the file does not exist. */
  read(path: string): string | null;
  /** File names (not paths) inside goal-loop/. */
  list(dir: string): string[];
}

export type GateResult = { ok: true; ready: boolean; grade?: string } | { ok: false; reason: string };

const BUILD_RE = /^v3-(?:[a-z0-9-]+-)?b(\d+[a-z]?)-\d{4}-\d{2}-\d{2}$/;

function countFor(text: string, level: "P0" | "P1"): number | null {
  const m = new RegExp(`^\\s*[-*]?\\s*\\**${level}\\**\\s*:\\s*(\\d+)\\b`, "im").exec(text);
  return m ? Number(m[1]) : null;
}

export function checkReleaseGate(files: GateFiles): GateResult {
  const marker = files.read(READY_MARKER);
  if (marker == null) return { ok: true, ready: false };
  const build = marker.trim().split(/\s+/)[0] || "";
  const m = BUILD_RE.exec(build);
  if (!m) return { ok: false, reason: `${READY_MARKER} must hold a build id like v3-b96-2026-11-02, not "${build}".` };
  const current = (files.read("public/build-version.txt") || "").trim();
  if (build !== current) return { ok: false, reason: `${READY_MARKER} names ${build} but public/build-version.txt is ${current || "missing"}.` };
  const prefix = `preview-b${m[1]}`;
  // b96 TT P3: "preview-b96.md" counts as well as "preview-b96-tt.md"; "preview-b961.md" does not.
  const grades = files.list(GRADE_DIR).filter((n) => n === `${prefix}.md` || (n.startsWith(`${prefix}-`) && n.endsWith(".md"))).sort();
  if (!grades.length) return { ok: false, reason: `No TT preview grade file ${GRADE_DIR}/${prefix}.md or ${prefix}-*.md for ${build}.` };
  for (const name of grades) {
    const text = files.read(`${GRADE_DIR}/${name}`) || "";
    if (!text.includes(build)) continue;
    const p0 = countFor(text, "P0");
    const p1 = countFor(text, "P1");
    if (p0 === 0 && p1 === 0) return { ok: true, ready: true, grade: `${GRADE_DIR}/${name}` };
  }
  return { ok: false, reason: `TT preview grade for ${build} must name the build and show "P0: 0" and "P1: 0".` };
}
