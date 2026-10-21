// BS-01 / G-20: pure slot + guard logic for the Cloudflare Worker cron trigger.
// Mirrors scripts/cron-watchdog.mjs (GRACE_MIN, MAX_DISPATCHES_PER_SLOT, slot maths, success-since-slot)
// so the Worker and the GitHub watchdog can never double-dispatch past the same cap.
export const GRACE_MIN = 45;
export const MAX_DISPATCHES_PER_SLOT = 2;
export type Job = "broker-sync" | "track-record";

export const CRON_BROKER = "7 16 * * *"; // cron.yml broker-sync, 16:07 UTC (05:07 NZDT)
export const CRON_TRACK = "23 */6 * * *"; // cron.yml track-record, :23 every 6 h
export const CRON_CATCHUP = "55 * * * *"; // hourly catch-up

export function latestDaily(now: number, h: number, m: number): number {
  const d = new Date(now);
  let t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), h, m);
  if (t > now) t -= 86_400_000;
  return t;
}

export function latestEvery6h(now: number, m: number): number {
  const d = new Date(now);
  let t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), Math.floor(d.getUTCHours() / 6) * 6, m);
  if (t > now) t -= 6 * 3_600_000;
  return t;
}

export function slotFor(job: Job, now: number): number {
  return job === "broker-sync" ? latestDaily(now, 16, 7) : latestEvery6h(now, 23);
}

/** Which jobs a given cron fire is responsible for, and whether it is the primary (on-slot) fire. */
export function jobsForCron(cron: string): { job: Job; primary: boolean }[] {
  if (cron === CRON_BROKER) return [{ job: "broker-sync", primary: true }];
  if (cron === CRON_TRACK) return [{ job: "track-record", primary: true }];
  if (cron === CRON_CATCHUP)
    return [
      { job: "broker-sync", primary: false },
      { job: "track-record", primary: false },
    ];
  return [];
}

export interface DecideInput {
  now: number;
  slot: number;
  successes: string[]; // completed_at of this job's successful cron.yml jobs
  dispatchesSince: number; // cron.yml workflow_dispatch runs created at or after the slot
  busy: boolean; // a cron.yml run is queued or in progress
  primary: boolean; // on-slot fire: skip the grace wait (this Worker *is* the schedule)
}

export function decide(i: DecideInput): { dispatch: boolean; reason: string } {
  if (i.now < i.slot) return { dispatch: false, reason: "slot not reached" };
  if (!i.primary && i.now - i.slot <= GRACE_MIN * 60_000) return { dispatch: false, reason: "within grace" };
  if (i.successes.some((s) => Date.parse(s) >= i.slot)) return { dispatch: false, reason: "on time" };
  if (i.busy) return { dispatch: false, reason: "cron.yml run queued or running" };
  if (i.dispatchesSince >= MAX_DISPATCHES_PER_SLOT) return { dispatch: false, reason: "dispatch limit for this slot" };
  return { dispatch: true, reason: i.primary ? "slot due" : "slot missed" };
}
