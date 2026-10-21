// BS-01 / G-20: Cloudflare Worker cron-dispatch slot + guard logic (workers/cron-dispatch).
import { describe, expect, it, vi } from "vitest";
import * as L from "../../workers/cron-dispatch/src/logic";
import { run } from "../../workers/cron-dispatch/src/index";
// @ts-ignore plain ESM script
import * as W from "../../scripts/cron-watchdog.mjs";

const T = (s: string) => Date.parse(s);

describe("slots", () => {
  it("broker-sync slot is 16:07Z today or yesterday", () => {
    expect(L.slotFor("broker-sync", T("2026-10-22T16:07:00Z"))).toBe(T("2026-10-22T16:07:00Z"));
    expect(L.slotFor("broker-sync", T("2026-10-22T16:06:59Z"))).toBe(T("2026-10-21T16:07:00Z"));
    expect(L.slotFor("broker-sync", T("2026-10-23T00:55:00Z"))).toBe(T("2026-10-22T16:07:00Z"));
  });
  it("track-record slot is the latest :23 on a 6-hour boundary", () => {
    expect(L.slotFor("track-record", T("2026-10-22T12:23:00Z"))).toBe(T("2026-10-22T12:23:00Z"));
    expect(L.slotFor("track-record", T("2026-10-22T12:22:00Z"))).toBe(T("2026-10-22T06:23:00Z"));
    expect(L.slotFor("track-record", T("2026-10-22T00:10:00Z"))).toBe(T("2026-10-21T18:23:00Z"));
  });
  it("matches scripts/cron-watchdog.mjs slot maths and constants", () => {
    expect(L.GRACE_MIN).toBe(W.GRACE_MIN);
    expect(L.MAX_DISPATCHES_PER_SLOT).toBe(W.MAX_DISPATCHES_PER_SLOT);
    for (let t = T("2026-10-20T00:00:00Z"); t < T("2026-10-23T00:00:00Z"); t += 7 * 60_000) {
      expect(L.latestDaily(t, 16, 7)).toBe(W.latestDaily(t, 16, 7));
      expect(L.latestEvery6h(t, 23)).toBe(W.latestEvery6h(t, 23));
    }
  });
  it("maps crons to jobs", () => {
    expect(L.jobsForCron("7 16 * * *")).toEqual([{ job: "broker-sync", primary: true }]);
    expect(L.jobsForCron("23 */6 * * *")).toEqual([{ job: "track-record", primary: true }]);
    expect(L.jobsForCron("55 * * * *").map((j) => j.primary)).toEqual([false, false]);
    expect(L.jobsForCron("0 0 * * *")).toEqual([]);
  });
});

describe("decide guard", () => {
  const slot = T("2026-10-22T16:07:00Z");
  const base = { slot, successes: [] as string[], dispatchesSince: 0, busy: false };
  it("primary fire dispatches at the slot", () => {
    expect(L.decide({ ...base, now: slot, primary: true }).dispatch).toBe(true);
  });
  it("catch-up waits for grace, then dispatches", () => {
    expect(L.decide({ ...base, now: slot + 44 * 60_000, primary: false }).reason).toBe("within grace");
    expect(L.decide({ ...base, now: slot + 48 * 60_000, primary: false }).dispatch).toBe(true);
  });
  it("skips when a success exists since the slot", () => {
    const d = L.decide({ ...base, now: slot + 3_600_000, primary: false, successes: ["2026-10-22T16:20:00Z"] });
    expect(d).toEqual({ dispatch: false, reason: "on time" });
    expect(L.decide({ ...base, now: slot + 3_600_000, primary: false, successes: ["2026-10-22T16:00:00Z"] }).dispatch).toBe(true);
  });
  it("skips while busy and caps at 2 dispatches per slot", () => {
    expect(L.decide({ ...base, now: slot, primary: true, busy: true }).dispatch).toBe(false);
    expect(L.decide({ ...base, now: slot, primary: true, dispatchesSince: 1 }).dispatch).toBe(true);
    expect(L.decide({ ...base, now: slot, primary: true, dispatchesSince: 2 }).reason).toBe("dispatch limit for this slot");
  });
  it("agrees with the watchdog for catch-up fires", () => {
    for (const mins of [10, 46, 120]) for (const n of [0, 1, 2]) for (const busy of [false, true]) {
      const now = slot + mins * 60_000;
      expect(L.decide({ ...base, now, primary: false, dispatchesSince: n, busy }).dispatch).toBe(
        W.decide({ now, slot, successes: [], dispatchesSince: n, busy }).dispatch,
      );
    }
  });
});

describe("run (mocked GitHub)", () => {
  const mk = (runs: any[], jobs: Record<number, any[]>) => {
    const calls: { url: string; method: string; body?: string; auth?: string }[] = [];
    const f = vi.fn(async (url: string, init: any = {}) => {
      calls.push({ url, method: init.method || "GET", body: init.body, auth: init.headers?.Authorization });
      if (url.includes("/dispatches")) return new Response(null, { status: 204 });
      if (url.includes("/workflows/cron.yml/runs")) return Response.json({ workflow_runs: runs });
      const id = Number(url.match(/runs\/(\d+)\/jobs/)?.[1]);
      return Response.json({ jobs: jobs[id] || [] });
    });
    return { f: f as unknown as typeof fetch, calls };
  };
  const env = { GH_ACTIONS_DISPATCH_TOKEN: "test-token" };
  const now = T("2026-10-22T16:07:00Z");

  it("dispatches broker-sync on its slot with no runs", async () => {
    const { f, calls } = mk([], {});
    const out = await run("7 16 * * *", now, env, f);
    const post = calls.find((c) => c.method === "POST")!;
    expect(post.url).toBe("https://api.github.com/repos/AetherForge-Ai/aetherforgeai/actions/workflows/cron.yml/dispatches");
    expect(JSON.parse(post.body!)).toEqual({ ref: "main", inputs: { job: "broker-sync" } });
    expect(out[0]).toMatch(/dispatched/);
    expect(out.join(" ")).not.toContain("test-token");
  });
  it("does not dispatch when broker-sync already succeeded since the slot", async () => {
    const runs = [{ id: 1, event: "schedule", status: "completed", created_at: "2026-10-22T16:08:00Z" }];
    const { f, calls } = mk(runs, { 1: [{ name: "broker-sync", conclusion: "success", completed_at: "2026-10-22T16:30:00Z" }] });
    const out = await run("55 * * * *", T("2026-10-22T16:55:00Z"), env, f);
    expect(calls.some((c) => c.method === "POST")).toBe(false);
    expect(out[0]).toMatch(/on time/);
  });
  it("respects the 2-dispatch cap", async () => {
    const runs = [1, 2].map((id) => ({ id, event: "workflow_dispatch", status: "completed", created_at: "2026-10-22T16:10:00Z" }));
    const { f, calls } = mk(runs, {});
    await run("55 * * * *", T("2026-10-22T16:55:00Z"), env, f);
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });
  it("refuses any other repo", async () => {
    const { f } = mk([], {});
    await expect(run("7 16 * * *", now, { ...env, GH_REPO: "x/y" }, f)).rejects.toThrow("repo not allowed");
  });
});
