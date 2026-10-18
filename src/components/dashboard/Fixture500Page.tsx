import Fixture500Client from "@/components/dashboard/Fixture500Client";
import { ServerQuotaStrip } from "@/components/dashboard/DashboardSessionShell";
import { readReportQuota } from "@/lib/dashboard-quota.server";

/**
 * b32 H-4: the 500-row ledger page, shared by /test-hooks/dashboard-500 and
 * /dashboard/transactions?fixture=500 (allow-listed accounts only; callers gate).
 * The Report Center quota is one bounded read (< 1 s): a correct figure or a retry, never a guess.
 */
export async function Fixture500Page({ retryHref }: { retryHref: string }) {
  const quota = await readReportQuota(900, 1);
  return (
    <>
      {quota.ok && quota.limit != null ? (
        <ServerQuotaStrip quota={{ used: quota.used, limit: quota.limit }} />
      ) : quota.ok ? (
        <p className="mx-auto mt-4 max-w-6xl px-6 text-sm" data-server-quota>
          Report quota: {quota.used} AI reports this month (no monthly cap on this plan)
        </p>
      ) : (
        <p className="mx-auto mt-4 max-w-6xl px-6 text-sm" data-server-quota role="alert">
          Your report quota did not load ({"reason" in quota && quota.reason === "timeout" ? "it took longer than 1 second" : "the read failed"}).{" "}
          <a className="underline" href={retryHref}>
            Try again
          </a>
        </p>
      )}
      <Fixture500Client />
    </>
  );
}
