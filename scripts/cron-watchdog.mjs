// BS-01 / G-20 (b53b): slot-aware watchdog for cron.yml, run by .github/workflows/cron-fallback.yml.
// For each cron.yml job, take the newest scheduled slot at or before now. If that slot is more than
// GRACE_MIN minutes past and the job has no success completed at or after the slot, dispatch it.
// track-record is idempotent per 6-hour slot (b53 slot key); broker-sync runs once a day.
// Uses only the workflow's GITHUB_TOKEN (GH_TOKEN). Reads no repo secrets and calls no app route.
export const GRACE_MIN = 45;
export const MAX_DISPATCHES_PER_SLOT = 2;

export const JOBS = [
  { job: "broker-sync", slot: (now) => latestDaily(now, 16, 7) }, // cron.yml "7 16 * * *" (05:07 NZDT)
  { job: "track-record", slot: (now) => latestEvery6h(now, 23) }, // cron.yml "23 */6 * * *"
];

export function latestDaily(now, h, m) {
  const d = new Date(now);
  let t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), h, m);
  if (t > d.getTime()) t -= 86_400_000;
  return t;
}

export function latestEvery6h(now, m) {
  const d = new Date(now);
  let t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), Math.floor(d.getUTCHours() / 6) * 6, m);
  if (t > d.getTime()) t -= 6 * 3_600_000;
  return t;
}

/**
 * Pure decision. successes: ISO completed_at of this job's successful runs. dispatchesSince: number of
 * cron.yml workflow_dispatch runs created at or after the slot. busy: a cron.yml run is queued/running.
 */
export function decide({ now, slot, successes, dispatchesSince = 0, busy = false }) {
  const t = new Date(now).getTime();
  if (t - slot <= GRACE_MIN * 60_000) return { dispatch: false, reason: "within grace" };
  if (successes.some((s) => Date.parse(s) >= slot)) return { dispatch: false, reason: "on time" };
  if (busy) return { dispatch: false, reason: "cron.yml run queued or running" };
  if (dispatchesSince >= MAX_DISPATCHES_PER_SLOT) return { dispatch: false, reason: "dispatch limit for this slot" };
  return { dispatch: true, reason: "slot missed" };
}

async function main() {
  const repo = process.env.REPO;
  const token = process.env.GH_TOKEN;
  const api = async (path, init = {}) => {
    const r = await fetch(`https://api.github.com/repos/${repo}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", ...(init.headers || {}) },
    });
    if (!r.ok) throw new Error(`${init.method || "GET"} ${path}: HTTP ${r.status}`);
    return r.status === 204 ? null : r.json();
  };
  const now = Date.now();
  const runs = (await api("/actions/workflows/cron.yml/runs?per_page=40")).workflow_runs;
  const busy = runs.some((r) => r.status === "queued" || r.status === "in_progress");
  const jobsByRun = new Map();
  for (const r of runs) jobsByRun.set(r.id, (await api(`/actions/runs/${r.id}/jobs`)).jobs);
  for (const { job, slot: slotOf } of JOBS) {
    const slot = slotOf(now);
    const successes = [...jobsByRun.values()].flat().filter((j) => j.name === job && j.conclusion === "success" && j.completed_at).map((j) => j.completed_at);
    const dispatchesSince = runs.filter((r) => r.event === "workflow_dispatch" && Date.parse(r.created_at) >= slot).length;
    const d = decide({ now, slot, successes, dispatchesSince, busy });
    const slotIso = new Date(slot).toISOString();
    if (d.dispatch) {
      console.log(`::notice title=cron-fallback::${job} slot ${slotIso} missed; dispatching cron.yml job=${job}`);
      await api("/actions/workflows/cron.yml/dispatches", { method: "POST", body: JSON.stringify({ ref: "main", inputs: { job } }) });
    } else {
      console.log(`${job} slot ${slotIso}: ${d.reason}`);
    }
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((e) => {
    console.error(String(e?.message || e).slice(0, 200));
    process.exit(1);
  });
}
