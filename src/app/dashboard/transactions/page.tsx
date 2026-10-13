import { permanentRedirect } from "next/navigation";

import { dashboardRedirectHref } from "@/lib/dashboard-redirect";
import { publicPageMetadata } from "@/lib/reviewed-book";

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
  permanentRedirect(dashboardRedirectHref(await searchParams, { tab: "transactions" }));
}
