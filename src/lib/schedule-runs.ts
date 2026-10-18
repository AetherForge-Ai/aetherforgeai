/**
 * b37 G-20 (GOAL-LOCK #55): the public "built by schedule" card. Pure shaping so it can be tested.
 * Only run times, how each run was triggered and its outcome are public: no token, no scorecard
 * body, no hash, no results (the results stay unpublished until Chief rules otherwise).
 */
export interface PublicScheduleRun {
  at: string;
  trigger: "schedule" | "manual" | "seed";
  outcome: string;
}

export interface PublicScheduleView {
  source: "github-actions" | "track-record-rows";
  runs: PublicScheduleRun[];
}

export function shapePublicScheduleRuns(
  gh: Array<{ at: string; conclusion: string; event: string }> | null,
  log: Array<{ at: string; builtBy: "schedule" | "seed" }>
): PublicScheduleView {
  if (gh) {
    return {
      source: "github-actions",
      runs: gh.slice(0, 3).map((r) => ({
        at: r.at,
        trigger: r.event === "schedule" ? "schedule" : "manual",
        outcome: r.conclusion,
      })),
    };
  }
  return {
    source: "track-record-rows",
    runs: log
      .filter((r) => r.builtBy === "schedule")
      .slice(0, 3)
      .map((r) => ({ at: r.at, trigger: "schedule", outcome: "stored" })),
  };
}

/** The headline: "Built by schedule <time>" only when the newest run was a scheduled one. */
export function scheduleHeadline(view: PublicScheduleView): string | null {
  const latest = view.runs.find((r) => r.trigger === "schedule");
  return latest ? latest.at : null;
}
