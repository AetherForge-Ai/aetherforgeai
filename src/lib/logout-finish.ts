/**
 * Sign-out finishes on this page once the logout POST returns.
 * A hanging session probe must not leave the spinner up.
 * pull-check:batch1-2026-10-11 R12
 */

export type SessionProbe = "present" | "absent" | "unknown";

export type LogoutStep = "done" | "retry" | "error";

/** 401 and 403 mean the session cookie is gone. Other failures are unknown. */
export function classifySessionProbe(status: number, userId: string | null | undefined): SessionProbe {
  if (status === 200) return userId ? "present" : "absent";
  if (status === 401 || status === 403) return "absent";
  return "unknown";
}

/**
 * A successful POST with an absent or unknown probe goes to the done card.
 * A session that is still present is retried once, then shown as an error.
 * A failed or timed-out POST is an error. It does not spin forever.
 */
export function logoutFinish(posted: boolean, probe: SessionProbe, alreadyRetried: boolean): LogoutStep {
  if (!posted) return "error";
  if (probe === "present") return alreadyRetried ? "error" : "retry";
  return "done";
}
