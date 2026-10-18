import { notFound } from "next/navigation";
import TestHooksPanel from "@/components/TestHooksPanel";
import { currentUserMayUseTestHooks } from "@/lib/test-hooks.server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Test-mode hooks · AetherForge AI", robots: { index: false, follow: false } };

// Goal b20 SECURITY: 404 for everyone except an allow-listed test account with GOAL_TEST_HOOKS=1.
export default async function Page() {
  if (!(await currentUserMayUseTestHooks())) notFound();
  return <TestHooksPanel enabled />;
}
