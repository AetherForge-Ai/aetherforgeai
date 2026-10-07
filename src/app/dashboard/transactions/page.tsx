import { renderDashboardView } from "@/lib/dashboard-page";
import { publicPageMetadata } from "@/lib/reviewed-book";

export const dynamic = "force-dynamic";

export const metadata = publicPageMetadata("/dashboard/transactions", {
  title: "Transaction Ledger · AetherForge AI",
  description: "The paper ledger for your AetherForge book.",
});

export default function Page() {
  return renderDashboardView("transactions");
}
