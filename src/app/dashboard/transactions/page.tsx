import { permanentRedirect } from "next/navigation";

import { dashboardRedirectHref } from "@/lib/dashboard-redirect";
import { publicPageMetadata } from "@/lib/reviewed-book";
import { currentUserMayUseTestHooks } from "@/lib/test-hooks.server";
import { Fixture500Page } from "@/components/dashboard/Fixture500Page";

export const dynamic = "force-dynamic";

export const metadata = publicPageMetadata("/dashboard/transactions", {
  title: "Transaction Ledger · AetherForge AI",
  description: "The paper ledger for your AetherForge book.",
});

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  // b32 H-4: the GOAL-LOCK test measures /dashboard/transactions with 500 rows. An allow-listed
  // test account gets the read-only 500-row ledger at this URL; everyone else (and the param on
  // any other account) gets the usual redirect to the dashboard Transactions tab.
  if (params.fixture === "500" && (await currentUserMayUseTestHooks())) {
    return <Fixture500Page retryHref="/dashboard/transactions?fixture=500" />;
  }
  const { fixture: _drop, ...rest } = params;
  void _drop;
  permanentRedirect(dashboardRedirectHref(rest, { tab: "transactions" }));
}
