import Link from "next/link";
import { headers } from "next/headers";
import { AppShell } from "@/components/AppShell";
import { ProjectionsExplorer } from "@/components/dashboard/ProjectionsExplorer";
import { publicPageMetadata } from "@/lib/reviewed-book";
import { PROJECTIONS_MEMBER_LINE } from "@/lib/public-copy";

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
 * The guest document is the same x-af-doc check the dashboard uses.
 * It shows a sign-in prompt and does not render the ranked table.
 * Crypto projections stay paused inside the member view.
 */
export default async function ProjectionsPage() {
  const headerList = await headers();
  const guestDocument = headerList.get("x-af-doc") !== "member";

  if (guestDocument) {
    return (
      <AppShell>
        <section className="mx-auto flex min-h-[50vh] w-full max-w-lg flex-col items-center justify-center px-4 py-16 text-center">
          <h1 className="font-display text-2xl font-bold tracking-tight">Projections</h1>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{PROJECTIONS_MEMBER_LINE}</p>
          <Link
            href="/login?redirect=/projections"
            className="mt-8 inline-flex h-11 items-center justify-center rounded-md bg-primary px-6 text-sm font-semibold text-primary-foreground"
          >
            Sign in
          </Link>
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <ProjectionsExplorer />
    </AppShell>
  );
}
