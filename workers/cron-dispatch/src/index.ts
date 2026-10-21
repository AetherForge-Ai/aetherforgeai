// BS-01 / G-20: Cloudflare Worker Cron Trigger that dispatches cron.yml independently of GitHub's
// scheduler (which dropped ~31 of 32 watchdog slots on 21-22 Oct 2026). Guard = scripts/cron-watchdog.mjs.
// Secret: GH_ACTIONS_DISPATCH_TOKEN (fine-grained, actions:write on AetherForge-Ai/aetherforgeai only).
// Never logs the token. Calls no app route and reads no other secret.
import { decide, jobsForCron, slotFor, type Job } from "./logic";

export interface Env {
  GH_ACTIONS_DISPATCH_TOKEN: string;
  GH_REPO?: string; // default AetherForge-Ai/aetherforgeai
}
interface ScheduledEvt {
  cron: string;
  scheduledTime: number;
}
interface Ctx {
  waitUntil(p: Promise<unknown>): void;
}

const REPO_DEFAULT = "AetherForge-Ai/aetherforgeai";

export async function run(cron: string, now: number, env: Env, f: typeof fetch = fetch): Promise<string[]> {
  const repo = env.GH_REPO || REPO_DEFAULT;
  if (repo !== REPO_DEFAULT) throw new Error("repo not allowed");
  const api = async (path: string, init: RequestInit = {}) => {
    const r = await f(`https://api.github.com/repos/${repo}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${env.GH_ACTIONS_DISPATCH_TOKEN}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "aetherforge-cron-dispatch",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
    });
    if (!r.ok) throw new Error(`${init.method || "GET"} ${path}: HTTP ${r.status}`);
    return r.status === 204 ? null : r.json();
  };
  const todo = jobsForCron(cron);
  if (!todo.length) return [`unknown cron ${cron}`];
  // Keep subrequests low (free plan cap 50): only runs created within 25 h are relevant.
  const earliest = Math.min(...todo.map((t) => slotFor(t.job, now))) - 3_600_000;
  const runs: any[] = (await api("/actions/workflows/cron.yml/runs?per_page=20")).workflow_runs.filter(
    (r: any) => Date.parse(r.created_at) >= earliest,
  );
  const busy = runs.some((r) => r.status === "queued" || r.status === "in_progress");
  const jobs: any[] = [];
  for (const r of runs.slice(0, 15)) jobs.push(...(await api(`/actions/runs/${r.id}/jobs`)).jobs);
  const out: string[] = [];
  for (const { job, primary } of todo) {
    const slot = slotFor(job as Job, now);
    const successes = jobs.filter((j) => j.name === job && j.conclusion === "success" && j.completed_at).map((j) => j.completed_at);
    const dispatchesSince = runs.filter((r) => r.event === "workflow_dispatch" && Date.parse(r.created_at) >= slot).length;
    const d = decide({ now, slot, successes, dispatchesSince, busy, primary });
    const slotIso = new Date(slot).toISOString();
    if (d.dispatch) {
      await api("/actions/workflows/cron.yml/dispatches", { method: "POST", body: JSON.stringify({ ref: "main", inputs: { job } }) });
      out.push(`${job} slot ${slotIso}: dispatched (${d.reason})`);
    } else out.push(`${job} slot ${slotIso}: ${d.reason}`);
  }
  return out;
}

export default {
  async scheduled(evt: ScheduledEvt, env: Env, ctx: Ctx) {
    ctx.waitUntil(
      run(evt.cron, evt.scheduledTime, env)
        .then((lines) => lines.forEach((l) => console.log(l)))
        .catch((e) => console.error(String(e?.message || e).slice(0, 200))),
    );
  },
  async fetch() {
    return new Response("cron-dispatch: scheduled only", { status: 404 });
  },
};
