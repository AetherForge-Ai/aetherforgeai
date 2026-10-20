/** BS-01 / G-20 (b53b): slot-aware cron watchdog (scripts/cron-watchdog.mjs). */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
// @ts-expect-error plain .mjs script, no type declarations
import { decide, GRACE_MIN, JOBS, latestDaily, latestEvery6h } from "../../scripts/cron-watchdog.mjs";

const at = (iso: string) => Date.parse(iso);
const slotOf = (job: string, now: number) => JOBS.find((j: { job: string }) => j.job === job).slot(now);
// fallback schedule minutes, read from the workflow so the test follows it
const minutes = /cron: "([\d,]+) \* \* \* \*"/.exec(readFileSync(".github/workflows/cron-fallback.yml", "utf8"))![1].split(",").map(Number);
function firstDispatch(job: string, from: number, successes: string[] = []) {
  for (let t = from; t < from + 3 * 3_600_000; t += 60_000) {
    const d = new Date(t);
    if (!minutes.includes(d.getUTCMinutes())) continue;
    if (decide({ now: t, slot: slotOf(job, t), successes }).dispatch) return t;
  }
  return null;
}

describe("b53b cron watchdog slots", () => {
  it("slot maths: 16:07 UTC daily, :23 every 6 h", () => {
    expect(new Date(latestDaily(at("2026-10-20T16:50:00Z"), 16, 7)).toISOString()).toBe("2026-10-20T16:07:00.000Z");
    expect(new Date(latestDaily(at("2026-10-20T16:00:00Z"), 16, 7)).toISOString()).toBe("2026-10-19T16:07:00.000Z");
    expect(new Date(latestEvery6h(at("2026-10-20T19:00:00Z"), 23)).toISOString()).toBe("2026-10-20T18:23:00.000Z");
    expect(new Date(latestEvery6h(at("2026-10-20T18:10:00Z"), 23)).toISOString()).toBe("2026-10-20T12:23:00.000Z");
    expect(GRACE_MIN).toBe(45);
  });
  it("a missed 05:07 NZDT (16:07 UTC) broker-sync slot is dispatched within 1 hour", () => {
    const slot = at("2026-10-20T16:07:00Z");
    const t = firstDispatch("broker-sync", slot, ["2026-10-19T21:00:00Z"]);
    expect(t).not.toBeNull();
    expect(t! - slot).toBeGreaterThan(45 * 60_000);
    expect(t! - slot).toBeLessThanOrEqual(60 * 60_000);
  });
  it("an on-time broker-sync slot is not re-dispatched", () => {
    const slot = at("2026-10-20T16:07:00Z");
    expect(firstDispatch("broker-sync", slot, ["2026-10-20T16:12:30Z"])).toBeNull();
  });
  it("a missed :23 track-record slot is dispatched within 1 hour; an on-time one is not", () => {
    const slot = at("2026-10-20T18:23:00Z");
    const t = firstDispatch("track-record", slot, ["2026-10-20T12:30:00Z"]);
    expect(t).not.toBeNull();
    expect(t! - slot).toBeLessThanOrEqual(60 * 60_000);
    const ok = decide({ now: at("2026-10-20T19:40:00Z"), slot, successes: ["2026-10-20T18:27:00Z"] });
    expect(ok.dispatch).toBe(false);
  });
  it("does not stack: busy cron.yml or two dispatches already sent for the slot", () => {
    const slot = at("2026-10-20T16:07:00Z");
    const now = at("2026-10-20T16:55:00Z");
    expect(decide({ now, slot, successes: [], busy: true }).dispatch).toBe(false);
    expect(decide({ now, slot, successes: [], dispatchesSince: 2 }).dispatch).toBe(false);
    expect(decide({ now, slot, successes: [], dispatchesSince: 1 }).dispatch).toBe(true);
  });
  it("the workflow runs the script with only the workflow token", () => {
    const wf = readFileSync(".github/workflows/cron-fallback.yml", "utf8");
    expect(wf).toContain("node scripts/cron-watchdog.mjs");
    expect(wf).not.toMatch(/secrets\./);
    const s = readFileSync("scripts/cron-watchdog.mjs", "utf8");
    expect(s).not.toMatch(/aetherforgeai\.co\.nz/);
    expect(s).toContain('inputs: { job }');
  });
});
