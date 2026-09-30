import { headers } from "next/headers";
import { AppShell } from "@/components/AppShell";
import { DashboardSessionShell } from "@/components/dashboard/DashboardSessionShell";
import type { DashboardView } from "@/components/dashboard/PortfolioDashboard";

/**
 * Private dashboard HTML never includes a member book.
 * Middleware sets `x-af-doc` from the request cookie. Guest documents render
 * the membership gate and the client must leave that gate in place. Member
 * documents render a skeleton until this browser's GET /api/session confirms
 * the account. Neither document carries a name, a cash figure, or a holding.
 */
export async function renderDashboardView(view: DashboardView) {
  const headerList = await headers();
  const guestDocument = headerList.get("x-af-doc") !== "member";
  return (
    <AppShell>
      <DashboardSessionShell view={view} guestDocument={guestDocument} />
    </AppShell>
  );
}
