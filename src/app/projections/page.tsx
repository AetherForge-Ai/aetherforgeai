import { AppShell } from "@/components/AppShell";
import { ProjectionsExplorer } from "@/components/dashboard/ProjectionsExplorer";
import { ProjectionsSignIn } from "@/components/projections/ProjectionsSignIn";
import { publicPageMetadata } from "@/lib/reviewed-book";
import { PROJECTIONS_MEMBER_LINE } from "@/lib/public-copy";
import { getStableSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata = {
  ...publicPageMetadata("/projections", {
    title: "Projections — AetherForge AI",
    description: PROJECTIONS_MEMBER_LINE,
  }),
  robots: { index: false, follow: false },
};

/**
 * /projections — share projections for a signed-in member.
 * A null session, including a forged session cookie, renders the sign-in
 * prompt. The ranked table is a client fetch of the 401-gated API and is
 * not passed as server props.
 * Crypto projections stay paused inside the member view.
 */
export default async function ProjectionsPage() {
  const user = await getStableSessionUser();

  if (!user) {
    return (
      <AppShell>
        <ProjectionsSignIn />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <ProjectionsExplorer />
    </AppShell>
  );
}
