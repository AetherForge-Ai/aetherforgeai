import { permanentRedirect } from "next/navigation";

import { dashboardRedirectHref } from "@/lib/dashboard-redirect";

/**
 * Older links used /ledger. The transaction centre lives on the dashboard Transactions tab.
 * b60 TT P3: one redirect straight to the tab (was 307 to /dashboard/transactions, then 308).
 */
export default async function LedgerRedirectPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const { fixture: _drop, ...rest } = params;
  void _drop;
  permanentRedirect(dashboardRedirectHref(rest, { tab: "transactions" }));
}
