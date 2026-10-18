export type QuotaRead =
  | { ok: true; used: number; limit: number }
  | { ok: true; used: number; limit: null }
  | { ok: false; reason: "signed-out" | "timeout" | "error" };

async function readQuotaOnce(): Promise<QuotaRead> {
  const [{ getCurrentUser }, { evaluateFreeReportQuota, monthlyReportLimit }, { countFreeReportsThisMonth }] = await Promise.all([
    import("@/lib/session"),
    import("@/lib/entitlements"),
    import("@/lib/report-month-count.server"),
  ]);
  const user = await getCurrentUser();
  if (!user) return { ok: false, reason: "signed-out" };
  const limit = monthlyReportLimit(user.subscription_plan);
  const { count } = await countFreeReportsThisMonth(user._id, Date.now());
  if (limit == null) return { ok: true, used: count, limit: null };
  const q = evaluateFreeReportQuota(count, Date.now(), limit);
  return { ok: true, used: q.used, limit: q.limit };
}

function bounded(ms: number): Promise<QuotaRead> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const work = readQuotaOnce().catch((err: unknown): QuotaRead => {
    // b26 H-4: log the real cause server-side; the page shows a retry, never a dash.
    console.error("[quota] report quota read failed:", err instanceof Error ? err.message : String(err));
    return { ok: false, reason: "error" };
  });
  return Promise.race([
    work,
    new Promise<QuotaRead>((resolve) => {
      timer = setTimeout(() => {
        console.warn(`[quota] report quota read timed out after ${ms} ms`);
        resolve({ ok: false, reason: "timeout" });
      }, ms);
    }),
  ]).finally(() => timer && clearTimeout(timer));
}

/** b26 H-4: up to two bounded attempts (≤ 5 s total), with the reason when both fail. */
export async function readReportQuota(attemptMs = 2400): Promise<QuotaRead> {
  const first = await bounded(attemptMs);
  if (!("reason" in first) || first.reason === "signed-out") return first;
  return bounded(attemptMs);
}

/** Goal b13 H-4: the monthly report allowance read on the server, bounded so it never holds the page. */
export async function serverReportQuota(): Promise<{ used: number; limit: number } | null> {
  const r = await bounded(900);
  return r.ok && r.limit != null ? { used: r.used, limit: r.limit } : null;
}
