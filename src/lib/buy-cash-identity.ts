/**
 * Buy-modal cash sequencing.
 *
 * Stock Markets (and any shell outside the dashboard account guard) does not
 * call bindActiveAccount. trackAccountRequest() then records userId null, and
 * the apply-gate discards a real logged-in balance:
 *   [buy-dialog] Discarding cash for other/stale user { requestUserId: null, responseUserId }
 *
 * Resolve who the request is for before it starts. A response may be applied
 * only when that id is echoed. Review stays disabled until the balance is known.
 */

export type BuyCashPlan =
  | { action: "fetch"; userId: string; bind: boolean }
  | { action: "refuse"; error: string };

/**
 * `liveUserId` is the session probe. Pass the active id again when the shell
 * is already bound and this open should not wait on (or be blocked by) a probe.
 */
export function planBuyCashFetch(
  activeUserId: string | null,
  liveUserId: string | null,
): BuyCashPlan {
  if (activeUserId) {
    if (liveUserId && liveUserId !== activeUserId) {
      return {
        action: "refuse",
        error: "This session does not match the account on screen.",
      };
    }
    return { action: "fetch", userId: activeUserId, bind: false };
  }
  if (!liveUserId) {
    return { action: "refuse", error: "Sign in to load available cash." };
  }
  return { action: "fetch", userId: liveUserId, bind: true };
}

export type BuyCashUi = {
  loading: boolean;
  balance: number | null;
  error: string | null;
};

/** Settled cash card. Loading is always cleared. A discarded body is an error, not a dash. */
export function buyCashUiFromResponse(input: {
  accepted: boolean;
  ok: boolean;
  status?: number;
  cashBalance?: unknown;
  error?: unknown;
}): BuyCashUi {
  if (!input.accepted) {
    return {
      loading: false,
      balance: null,
      error: "Could not confirm available cash for this account.",
    };
  }
  if (input.ok && typeof input.cashBalance === "number" && Number.isFinite(input.cashBalance)) {
    return { loading: false, balance: input.cashBalance, error: null };
  }
  if (input.status === 401) {
    return { loading: false, balance: null, error: "Sign in to load available cash." };
  }
  const message =
    typeof input.error === "string" && input.error.trim()
      ? input.error
      : "Could not load available cash.";
  return { loading: false, balance: null, error: message };
}

/** Review and confirm stay off until a finite balance for this account is showing. */
export function buyReviewAllowed(ui: {
  loading: boolean;
  balance: number | null;
  error: string | null;
}): boolean {
  return !ui.loading && ui.error == null && typeof ui.balance === "number" && Number.isFinite(ui.balance);
}
