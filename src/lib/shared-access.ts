/**
 * DIAG-FLAGS-1: the /shared page's answer, without the session or the React tree.
 * Middleware calls the same both-flags rule before it would redirect to login.
 */
import { edgeFlagState, runtimeFlagState } from "@/lib/diag-flags";
import { featureOnFor } from "@/lib/preview-grading";
import { sharedRouteGate } from "@/lib/route-gate";
import { testHooksAllowedFor } from "@/lib/test-hooks";

type SharedUser = { _id?: string | null; email?: string | null } | null | undefined;

export function decideSharedPage(
  user: SharedUser,
  opts?: {
    edgeOn?: boolean;
    runtimeOn?: boolean;
    env?: Record<string, string | undefined>;
  },
): "not-found" | "login" | "ok" {
  const env = opts?.env ?? process.env;
  const edgeOn = opts?.edgeOn ?? edgeFlagState().PORTFOLIO_SHARING;
  const runtimeOn = opts?.runtimeOn ?? runtimeFlagState(env).PORTFOLIO_SHARING;
  const allowListed = testHooksAllowedFor(user, env);
  const gate = sharedRouteGate({ signedIn: Boolean(user), edgeOn, runtimeOn, allowListed });
  if (gate === "not-found" || !featureOnFor("PORTFOLIO_SHARING", user, env)) return "not-found";
  if (!user) return "login";
  return "ok";
}
