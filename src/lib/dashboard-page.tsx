import { cookies } from "next/headers";
import { AppShell } from "@/components/AppShell";
import { DashboardSessionShell } from "@/components/dashboard/DashboardSessionShell";
import type { DashboardView } from "@/components/dashboard/PortfolioDashboard";
import { requestHasSessionToken } from "@/lib/session-owner";

/**
 * Dashboard HTML never includes a member book.
 * A request with no session cookie renders the signed-out gate.
 * A request that has a cookie still waits for GET /api/session in the
 * browser before any name, cash, or holding is painted — so a shared
 * document cache cannot show another account.
 */
export async function renderDashboardView(view: DashboardView) {
  const jar = await cookies();
  const signedIn = requestHasSessionToken((name) => jar.get(name)?.value);
  return (
    <AppShell guest={!signedIn}>
      <DashboardSessionShell view={view} initialSignedOut={!signedIn} />
    </AppShell>
  );
}
