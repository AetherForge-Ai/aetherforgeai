import { Suspense } from "react";
import Fixture500Client from "@/components/dashboard/Fixture500Client";
import { ServerQuotaStrip } from "@/components/dashboard/DashboardSessionShell";
import { readReportQuota } from "@/lib/dashboard-quota.server";

/** b37 H-4: a quota attempt is under 1 s (900 ms); a timeout falls back to this member's cached figure, then a second try. It streams in beside the ledger. */
export const FIXTURE_QUOTA_ATTEMPT_MS = 900;

async function FixtureQuota({ retryHref }: { retryHref: string }) {
  const quota = await readReportQuota(FIXTURE_QUOTA_ATTEMPT_MS, 2);
  if (quota.ok && quota.limit != null) return <ServerQuotaStrip quota={{ used: quota.used, limit: quota.limit }} />;
  if (quota.ok)
    return (
      <p className="mx-auto mt-4 max-w-6xl px-6 text-sm" data-server-quota>
        Report quota: {quota.used} AI reports this month (no monthly cap on this plan)
      </p>
    );
  return (
    <p className="mx-auto mt-4 max-w-6xl px-6 text-sm" data-server-quota role="alert">
      Your report quota did not load ({"reason" in quota && quota.reason === "timeout" ? "it timed out twice" : "the read failed"}).{" "}
      <a className="underline" href={retryHref}>
        Try again
      </a>
    </p>
  );
}

/**
 * b32 H-4: the 500-row ledger page, shared by /test-hooks/dashboard-500 and
 * /dashboard/transactions?fixture=500 (allow-listed accounts only; callers gate).
 * b37 H-4: the ledger no longer waits for the quota. The quota streams in beside the book in a Suspense
 * boundary (two bounded reads), so a slow read can't block the response, and a 1 s miss no longer
 * shows an error: a correct figure or a retry link, never a guess.
 */
export async function Fixture500Page({ retryHref }: { retryHref: string }) {
  return (
    <>
      <Suspense
        fallback={
          <p className="mx-auto mt-4 max-w-6xl px-6 text-sm text-muted-foreground" data-server-quota-loading>
            Loading report quota…
          </p>
        }
      >
        <FixtureQuota retryHref={retryHref} />
      </Suspense>
      <Fixture500Client />
    </>
  );
}
