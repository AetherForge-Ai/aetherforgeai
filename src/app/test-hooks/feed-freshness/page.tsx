import { notFound } from "next/navigation";
import { FeedFreshnessHookPanel } from "@/components/FeedFreshnessHookPanel";
import { currentUserMayUseTestHooks } from "@/lib/test-hooks.server";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Feed freshness hook · AetherForge AI",
  robots: { index: false, follow: false },
};

/**
 * G-05. Own route so it does not share a file with the H-12 hook.
 * Signed-out visitors and accounts that are not allow-listed get a 404.
 */
export default async function Page() {
  if (!(await currentUserMayUseTestHooks())) notFound();
  return <FeedFreshnessHookPanel />;
}
