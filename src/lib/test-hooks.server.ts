import { getCurrentUser } from "@/lib/session";
import { testHooksAllowedFor } from "@/lib/test-hooks";

/** Goal b20 SECURITY: the signed-in user may use test hooks (switch on and allow-listed). */
export async function currentUserMayUseTestHooks(): Promise<boolean> {
  if (process.env.GOAL_TEST_HOOKS !== "1") return false;
  const user = await getCurrentUser().catch(() => null);
  return testHooksAllowedFor(user as { _id?: string; email?: string } | null);
}
