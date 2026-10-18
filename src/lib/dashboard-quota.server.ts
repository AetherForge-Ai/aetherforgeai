export type QuotaRead =
  | { ok: true; used: number; limit: number }
  | { ok: true; used: number; limit: null }
  | { ok: false; reason: "signed-out" | "timeout" | "error" };

/**
 * b37 H-4: the last good quota per user id (memory only, 2 min). The session is resolved first, so
 * a cached figure is only ever served to the same user. On a slow count read the page shows that recent
 * correct figure instead of an error. A new report clears it (forgetReportQuota).
 */
// Other isolates can't be cleared, so the cache is short-lived: 2 minutes.
const QUOTA_CACHE_MS = 2 * 60_000;
const quotaCache = new Map<string, { value: QuotaRead; at: number }>();

export function forgetReportQuota(userId: string): void {
  quotaCache.delete(String(userId));
}

function cachedFor(userId: string): QuotaRead | null {
  const hit = quotaCache.get(userId);
  return hit && Date.now() - hit.at < QUOTA_CACHE_MS ? hit.value : null;
}

function race<T>(work: Promise<T>, ms: number, onTimeout: () => T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    work,
    new Promise<T>((resolve) => {
      timer = setTimeout(() => resolve(onTimeout()), ms);
    }),
  ]).finally(() => timer && clearTimeout(timer));
}

async function countFor(user: { _id: string; subscription_plan?: string | null }): Promise<QuotaRead> {
  const [{ evaluateFreeReportQuota, monthlyReportLimit }, { countFreeReportsThisMonth }] = await Promise.all([
    import("@/lib/entitlements"),
    import("@/lib/report-month-count.server"),
  ]);
  const limit = monthlyReportLimit(user.subscription_plan as never);
  const { count } = await countFreeReportsThisMonth(user._id, Date.now());
  const value: QuotaRead =
    limit == null
      ? { ok: true, used: count, limit: null }
      : (() => {
          const q = evaluateFreeReportQuota(count, Date.now(), limit);
          return { ok: true as const, used: q.used, limit: q.limit };
        })();
  quotaCache.set(String(user._id), { value, at: Date.now() });
  return value;
}

function bounded(ms: number): Promise<QuotaRead> {
  const started = Date.now();
  const work = (async (): Promise<QuotaRead> => {
    const { getCurrentUser } = await import("@/lib/session");
    const user = (await getCurrentUser()) as { _id: string; subscription_plan?: string | null } | null;
    if (!user) return { ok: false, reason: "signed-out" };
    const id = String(user._id);
    const left = Math.max(50, ms - (Date.now() - started));
    return race(countFor(user), left, () => {
      const cached = cachedFor(id);
      if (cached) return cached;
      console.warn(`[quota] report quota read timed out after ${ms} ms`);
      return { ok: false, reason: "timeout" };
    });
  })().catch((err: unknown): QuotaRead => {
    // b26 H-4: log the real cause server-side; the page shows a retry, never a dash.
    console.error("[quota] report quota read failed:", err instanceof Error ? err.message : String(err));
    return { ok: false, reason: "error" };
  });
  return race(work, ms + 50, () => {
    console.warn(`[quota] report quota read timed out after ${ms} ms`);
    return { ok: false, reason: "timeout" };
  });
}

/** b26 H-4: up to two bounded attempts (≤ 5 s total), with the reason when both fail. */
export async function readReportQuota(attemptMs = 2400, attempts = 2): Promise<QuotaRead> {
  const first = await bounded(attemptMs);
  if (attempts < 2 || !("reason" in first) || first.reason === "signed-out") return first;
  return bounded(attemptMs);
}

/** Goal b13 H-4: the monthly report allowance read on the server, bounded so it never holds the page. */
export async function serverReportQuota(): Promise<{ used: number; limit: number } | null> {
  const r = await bounded(900);
  return r.ok && r.limit != null ? { used: r.used, limit: r.limit } : null;
}
