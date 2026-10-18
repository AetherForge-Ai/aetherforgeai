import "server-only";

/**
 * b36 G-20 (GOAL-LOCK #55): the last 3 cron.yml runs from GitHub Actions, read server-side only
 * when GITHUB_ACTIONS_READ_TOKEN is set. The token is sent only to api.github.com in the
 * Authorization header and is never logged, returned or rendered. Null when unset or on any error;
 * the page then uses the track-record rows' own timestamps.
 */
export interface CronRun {
  at: string;
  conclusion: string;
  durationS: number | null;
  event: string;
}

const RUNS_URL = "https://api.github.com/repos/AetherForge-Ai/aetherforgeai/actions/workflows/cron.yml/runs?per_page=3";

export async function lastCronRuns(env: Record<string, string | undefined> = process.env, fetcher: typeof fetch = fetch): Promise<CronRun[] | null> {
  const token = (env.GITHUB_ACTIONS_READ_TOKEN || "").trim();
  if (!token) return null;
  try {
    const res = await fetcher(RUNS_URL, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "AetherForge-status" },
      cache: "no-store",
      signal: AbortSignal.timeout(2_000),
    });
    if (!res.ok) {
      console.warn(`[cron-runs] GitHub answered HTTP ${res.status}`);
      return null;
    }
    const body = (await res.json()) as { workflow_runs?: Array<{ created_at?: string; updated_at?: string; run_started_at?: string; conclusion?: string | null; status?: string; event?: string }> };
    return (body.workflow_runs || []).slice(0, 3).map((r) => {
      const start = Date.parse(r.run_started_at || r.created_at || "");
      const end = Date.parse(r.updated_at || "");
      return {
        at: r.run_started_at || r.created_at || "",
        conclusion: r.conclusion || r.status || "unknown",
        durationS: Number.isFinite(start) && Number.isFinite(end) && end >= start ? Math.round((end - start) / 1000) : null,
        event: r.event || "",
      };
    });
  } catch {
    console.warn("[cron-runs] GitHub read failed");
    return null;
  }
}
