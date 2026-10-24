/**
 * b64 BS-01 (GOAL-LOCK #66): IBKR sandbox connect path for TT grading without a real Flex token.
 * Only reachable by allow-listed test accounts (GOAL_TEST_HOOKS=1 and id in
 * GOAL_TEST_HOOK_USER_IDS); everyone else gets 404. Never calls IBKR.
 *
 * Sandbox tokens (digits, so they pass the normal token shape check):
 *   SANDBOX_TOKEN_OK       → connects; Sync now applies the bundled Flex fixture statement
 *   SANDBOX_TOKEN_INVALID  → refused like IBKR 1015, nothing saved
 *   SANDBOX_TOKEN_EXPIRED  → refused like IBKR 1012, nothing saved
 * A sandbox connection is stored with query id SANDBOX_QUERY_ID so the sync worker knows to use
 * the fixture instead of the network.
 */
import { FLEX_ERRORS, validFlexToken } from "@/lib/broker-sync/ibkr-flex";

export const SANDBOX_TOKEN_OK = "9000000000000000000001";
export const SANDBOX_TOKEN_INVALID = "9000000000000000001015";
export const SANDBOX_TOKEN_EXPIRED = "9000000000000000001012";
export const SANDBOX_QUERY_ID = "900000";

export type SandboxCheck = { ok: true } | { ok: false; code: string; message: string };

export function sandboxVerify(token: string): SandboxCheck {
  const t = String(token || "").trim();
  if (!validFlexToken(t)) return { ok: false, code: "shape", message: "That does not look like an IBKR Flex token (digits only)." };
  if (t === SANDBOX_TOKEN_OK) return { ok: true };
  if (t === SANDBOX_TOKEN_EXPIRED) return { ok: false, code: "1012", message: FLEX_ERRORS["1012"] };
  return { ok: false, code: "1015", message: FLEX_ERRORS["1015"] };
}

export function isSandboxConnection(conn: { query_id?: string | null } | null | undefined): boolean {
  return String(conn?.query_id || "") === SANDBOX_QUERY_ID;
}
