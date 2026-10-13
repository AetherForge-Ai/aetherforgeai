import { permanentRedirect } from "next/navigation";

import { dashboardRedirectHref } from "@/lib/dashboard-redirect";
import { publicPageMetadata } from "@/lib/reviewed-book";

export const dynamic = "force-dynamic";

export const metadata = publicPageMetadata("/dashboard/crypto", {
  title: "Crypto Portfolio · AetherForge AI",
  description: "Paper crypto holdings on your AetherForge book.",
});

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  permanentRedirect(dashboardRedirectHref(await searchParams, { view: "crypto" }));
}
