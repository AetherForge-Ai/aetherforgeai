/**
 * Client account identity — the single source of truth for which user the
 * dashboard is allowed to render.
 *
 * Portfolio, cash, and ledger fetches capture an epoch when they start.
 * Applying a body requires ALL of:
 *   - the epoch is still current (user has not switched)
 *   - the request was started for the active user
 *   - the response echoes that same userId (missing echo is rejected)
 *   - no row is owned by a different user
 *
 * Switching users aborts in-flight account requests so a slow prior-account
 * response cannot hydrate the next screen (~8s 1T→TT cash overwrite).
 */

import { hasForeignOwner } from "@/lib/account-guard";

export type AccountEpoch = number;

let activeUserId: string | null = null;
let epoch: AccountEpoch = 0;
const inflight = new Set<AbortController>();

export function getActiveAccountUserId(): string | null {
  return activeUserId;
}

export function getAccountEpoch(): AccountEpoch {
  return epoch;
}

/**
 * Bind the account the UI is showing. No-ops when the id is unchanged.
 * A real switch bumps the epoch and aborts every in-flight account fetch.
 * Server renders skip the module — it is per-tab, not per-isolate.
 */
export function bindActiveAccount(userId: string | null): void {
  if (typeof window === "undefined") return;
  if (activeUserId === userId) return;
  activeUserId = userId;
  epoch += 1;
  for (const controller of inflight) {
    try {
      controller.abort();
    } catch {
      /* ignore */
    }
  }
  inflight.clear();
}

export interface TrackedAccountRequest {
  epoch: AccountEpoch;
  userId: string | null;
  signal: AbortSignal;
  release: () => void;
}

/** Register an account-scoped fetch. Aborted automatically on user switch. */
export function trackAccountRequest(): TrackedAccountRequest {
  const controller = new AbortController();
  inflight.add(controller);
  const capturedEpoch = epoch;
  const capturedUser = activeUserId;
  return {
    epoch: capturedEpoch,
    userId: capturedUser,
    signal: controller.signal,
    release: () => {
      inflight.delete(controller);
    },
  };
}

/**
 * Whether a finished fetch may write portfolio/cash/ledger state.
 * Compares against the *active* user at apply time, not only the id the
 * request was started with (those match for a stale prior-account response).
 */
export function shouldApplyAccountResponse(opts: {
  epoch: AccountEpoch;
  requestUserId: string | null;
  responseUserId?: string | null;
}): boolean {
  if (opts.epoch !== epoch) return false;
  if (opts.requestUserId !== activeUserId) return false;
  if (!activeUserId) return false;
  if (!opts.responseUserId) return false;
  return opts.responseUserId === activeUserId;
}

/** Envelope userId, else a userId field on a non-array `data` object. */
export function responseUserId(res: { userId?: string | null; data?: unknown }): string | null {
  if (typeof res.userId === "string" && res.userId) return res.userId;
  const data = res.data;
  if (data && typeof data === "object" && !Array.isArray(data) && "userId" in data) {
    const id = (data as { userId?: unknown }).userId;
    if (typeof id === "string" && id) return id;
  }
  return null;
}

/** Apply-gate plus row-owner check. `rows` may be omitted for cash-only bodies. */
export function acceptAccountPayload(opts: {
  epoch: AccountEpoch;
  requestUserId: string | null;
  responseUserId?: string | null;
  rows?: unknown;
}): boolean {
  if (
    !shouldApplyAccountResponse({
      epoch: opts.epoch,
      requestUserId: opts.requestUserId,
      responseUserId: opts.responseUserId,
    })
  ) {
    return false;
  }
  if (opts.requestUserId && hasForeignOwner(opts.rows, opts.requestUserId)) return false;
  return true;
}

/** Test helper. */
export function __resetAccountIdentityForTests(): void {
  activeUserId = null;
  epoch = 0;
  for (const controller of inflight) {
    try {
      controller.abort();
    } catch {
      /* ignore */
    }
  }
  inflight.clear();
}
