/**
 * b91 (G-19, G-27, G-28): lets TT grade flag-off features on preview without turning any flag on.
 * A feature is on for a request when its own flag is on, or when the signed-in account is an
 * allow-listed test account (GOAL_TEST_HOOKS=1 and its id in GOAL_TEST_HOOK_USER_IDS). Real members
 * see nothing while the flag is off. No env or flag is changed by this file.
 */
import { flagOn } from "@/lib/schema/types";
import { testHooksAllowedFor } from "@/lib/test-hooks";

type Env = Record<string, string | undefined>;
type MaybeUser = { _id?: string | null; email?: string | null } | null | undefined;

export function featureOnFor(flag: string, user: MaybeUser, env: Env = process.env): boolean {
  return flagOn(flag, env) || testHooksAllowedFor(user, env);
}

/** True when a Totalum error says the table does not exist (the three b91 tables are unconfirmed). */
export function tableMissing(err: unknown): boolean {
  const text = err instanceof Error ? `${err.message} ${String((err as { response?: { data?: unknown } }).response?.data ?? "")}` : String(err ?? "");
  return /(table|element|collection)[^.]*(not found|does not exist|doesn't exist|unknown)|no such table|unknown (table|element)|not exist/i.test(text);
}

/** The plain-words reply when a feature's table is missing or unreachable. Nothing is saved. */
export function storageUnavailable(feature: string, table: string, err: unknown): { status: number; error: string; table?: string } {
  if (tableMissing(err)) return { status: 503, error: `${feature} isn't set up yet: the ${table} table is missing. Nothing was saved.`, table };
  return { status: 503, error: `${feature} is unavailable just now.` };
}
