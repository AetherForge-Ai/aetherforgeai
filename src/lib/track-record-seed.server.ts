import "server-only";
import { keepAlive } from "@/lib/keep-alive.server";
import { runTrackRecordBounded } from "@/lib/track-record-run.server";
import { persistTrackRun } from "@/lib/track-record-store.server";

/**
 * b29 G-20: self-seeding store. No cron secret is available to trigger /api/cron/track-record
 * after deploy, so the first visitor that finds no stored card (or a card older than
 * TRACK_RESEED_AFTER_MS) starts one build in the background (Workers waitUntil) and stores it.
 * Every later visitor reads the stored card first. One seed per isolate at a time.
 */
export const TRACK_RESEED_AFTER_MS = 24 * 60 * 60_000;
/** The live fallback the page waits for; the seed keeps running after this. */
export const TRACK_LIVE_WAIT_MS = 5_000;
const SEED_BUILD_MS = 120_000;
let seeding: Promise<unknown> | null = null;

export function seedTrackRecordStore(): "started" | "already-running" {
  if (seeding) return "already-running";
  const job = runTrackRecordBounded(Date.now(), undefined, SEED_BUILD_MS)
    .then(async (out) => {
      if ("error" in out) throw new Error(out.error);
      const stored = await persistTrackRun(out.run, undefined, undefined, { builtBy: "seed" });
      console.info("[track-record] seed", JSON.stringify({ stored: stored.ok, calls: out.run.calls.length }));
    })
    .catch((err) => console.warn("[track-record] seed failed:", err instanceof Error ? err.message.slice(0, 120) : "error"))
    .finally(() => {
      seeding = null;
    });
  seeding = job;
  void keepAlive(job);
  return "started";
}

export function storedCardIsStale(storedAt: string, now = Date.now()): boolean {
  const at = Date.parse(storedAt);
  return !Number.isFinite(at) || now - at > TRACK_RESEED_AFTER_MS;
}
