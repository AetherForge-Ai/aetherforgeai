/** Goal b13 H-4: the monthly report allowance read on the server, bounded so it never holds the page. */
export async function serverReportQuota(): Promise<{ used: number; limit: number } | null> {
  const work = (async () => {
    const [{ getCurrentUser }, { evaluateFreeReportQuota, monthlyReportLimit }, { countFreeReportsThisMonth }] = await Promise.all([
      import("@/lib/session"),
      import("@/lib/entitlements"),
      import("@/lib/report-month-count.server"),
    ]);
    const user = await getCurrentUser();
    if (!user) return null;
    const limit = monthlyReportLimit(user.subscription_plan);
    if (limit == null) return null;
    const { count } = await countFreeReportsThisMonth(user._id, Date.now());
    const q = evaluateFreeReportQuota(count, Date.now(), limit);
    return { used: q.used, limit: q.limit };
  })().catch(() => null);
  return Promise.race([work, new Promise<null>((resolve) => setTimeout(() => resolve(null), 900))]);
}

