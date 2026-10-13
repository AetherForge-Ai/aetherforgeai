import { redirect } from "next/navigation";

import { dashboardRedirectHref } from "@/lib/dashboard-redirect";
import { publicPageMetadata } from "@/lib/reviewed-book";

export const dynamic = "force-dynamic";

export const metadata = publicPageMetadata("/dashboard/stocks", {
  title: "Stock Portfolio · AetherForge AI",
  description: "Paper stock holdings on your AetherForge book.",
});

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirect(dashboardRedirectHref(await searchParams, { view: "shares" }));
}
