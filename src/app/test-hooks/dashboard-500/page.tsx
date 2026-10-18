import { notFound } from "next/navigation";
import Fixture500Client from "@/components/dashboard/Fixture500Client";
import { currentUserMayUseTestHooks } from "@/lib/test-hooks.server";
import { ServerQuotaStrip } from "@/components/dashboard/DashboardSessionShell";
import { serverReportQuota } from "@/lib/dashboard-quota.server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Example data · 500 rows · AetherForge AI", robots: { index: false, follow: false } };

// Goal b20 SECURITY: same gate as /test-hooks.
export default async function Page() {
  if (!(await currentUserMayUseTestHooks())) notFound();
  // Goal b21 H-4: the same server-read Report Center quota as /dashboard, in the first HTML.
  const quota = await serverReportQuota().catch(() => null);
  return (
    <>
      {quota ? <ServerQuotaStrip quota={quota} /> : <p className="mx-auto mt-4 max-w-6xl px-6 text-sm" data-server-quota>Report quota: — (could not be read)</p>}
      <Fixture500Client />
    </>
  );
}
