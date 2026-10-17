import { totalumSdk } from "@/lib/totalum";
import { setDurableCounterStore, type DurableCounterStore } from "@/lib/ip-rate-limit";

/**
 * Durable rate-limit counter in the Totalum table `rate_limit_counter`
 * (bucket_key: string, count: number, expires_at: date with hour).
 * Every Worker isolate and region reads the same row, so a limit holds across
 * regions (CR-2). If the table is missing or Totalum fails, the store reports
 * the error and the caller falls back to the Cache API and memory counts.
 * A failure turns the store off for this isolate for five minutes so a missing
 * table does not add a slow round trip to every request.
 */
const TABLE = "rate_limit_counter";
/** A slow store must never hold up a sign-in or a chat reply. */
export const DURABLE_COUNTER_TIMEOUT_MS = 1200;
let disabledUntil = 0;

function withDeadline<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    work,
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new Error("durable counter timeout")), ms);
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

type Row = { _id: string; count?: number | null; bucket_key?: string | null };

export const totalumCounterStore: DurableCounterStore = {
  async increment(storageKey, windowMs, now) {
    if (Date.now() < disabledUntil) throw new Error("durable counter off");
    try {
      return await withDeadline(incrementRow(storageKey, windowMs, now), DURABLE_COUNTER_TIMEOUT_MS);
    } catch (err) {
      disabledUntil = Date.now() + 5 * 60 * 1000;
      console.warn("[rate-limit] durable counter unavailable; using cache and memory", err instanceof Error ? err.message : "error");
      throw err;
    }
  },
};

/**
 * b6 CR-2: append-only counting. The old read-modify-write on one row lost
 * updates under a burst (eight isolates all read N and all wrote N + 1), so the
 * count never passed the limit. Each hit now inserts its own row and the count
 * is the number of rows for the bucket, which cannot lose a concurrent hit.
 */
export const DURABLE_COUNT_SCAN = 200;

async function incrementRow(storageKey: string, windowMs: number, now: number): Promise<number> {
  const windowEnd = (Math.floor(now / windowMs) + 1) * windowMs;
  await totalumSdk.crud.createRecord(TABLE, {
    bucket_key: storageKey,
    count: 1,
    expires_at: new Date(windowEnd).toISOString(),
  });
  const res = await totalumSdk.crud.query(TABLE, {
    _filter: { bucket_key: storageKey },
    _limit: DURABLE_COUNT_SCAN,
  } as never);
  // Count only this bucket's rows, in case the store ignores the filter.
  const rows = ((res?.data as Row[] | undefined) || []).filter(
    (r) => r.bucket_key == null || r.bucket_key === storageKey
  ).length;
  // Our own insert is always one of them, even if the read lags.
  return Math.max(1, rows);
}

setDurableCounterStore(totalumCounterStore);

export function ensureDurableRateLimit(): void {
  // Importing this module registers the store. The call keeps the import from being tree-shaken.
}
