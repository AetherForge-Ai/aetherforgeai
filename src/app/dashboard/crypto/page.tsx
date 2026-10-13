import { DashboardRedirect } from "@/components/dashboard/DashboardRedirect";
import { publicPageMetadata } from "@/lib/reviewed-book";

export const dynamic = "force-dynamic";

export const metadata = publicPageMetadata("/dashboard/crypto", {
  title: "Crypto Portfolio · AetherForge AI",
  description: "Paper crypto holdings on your AetherForge book.",
});

export default function Page() {
  return <DashboardRedirect href="/dashboard?view=crypto" />;
}
