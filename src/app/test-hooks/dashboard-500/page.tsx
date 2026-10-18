import { notFound } from "next/navigation";
import Fixture500Client from "@/components/dashboard/Fixture500Client";
import { currentUserMayUseTestHooks } from "@/lib/test-hooks.server";
import { ServerQuotaStrip } from "@/components/dashboard/DashboardSessionShell";
import { readReportQuota } from "@/lib/dashboard-quota.server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Example data · 500 rows · AetherForge AI", robots: { index: false, follow: false } };

// Goal b20 SECURITY: same gate as /test-hooks.
export default async function Page() {
  if (!(await currentUserMayUseTestHooks())) notFound();
  // b26 H-4: two bounded reads (≤ 5 s). A plan without a monthly cap says so; a failure offers a retry.
  const quota = await readReportQuota();
  return (
    <>
      {quota.ok && quota.limit != null ? (
        <ServerQuotaStrip quota={{ used: quota.used, limit: quota.limit }} />
      ) : quota.ok ? (
        <p className="mx-auto mt-4 max-w-6xl px-6 text-sm" data-server-quota>Report quota: {quota.used} AI reports this month (no monthly cap on this plan)</p>
      ) : (
        <p className="mx-auto mt-4 max-w-6xl px-6 text-sm" data-server-quota role="alert">
          Your report quota did not load ({"reason" in quota && quota.reason === "timeout" ? "it took longer than 5 seconds" : "the read failed"}).{" "}
          <a className="underline" href="/test-hooks/dashboard-500">Try again</a>
        </p>
      )}
      <Fixture500Client />
    </>
  );
}
