/**
 * Module-level Buy/Add open flag — survives TransactionCenter remounts during
 * holdings live-price hydrate (round 5–6). MUST be rebound/cleared on userId
 * change so a prior account's sticky open cannot reopen on another session.
 */

export type StickyTxMode = "buy" | "sell" | "deposit" | "withdraw";

let stickyTxOpen = false;
let stickyTxMode: StickyTxMode = "buy";
let stickyTxUserId: string | null = null;

export function isTransactionDialogOpen(): boolean {
  return stickyTxOpen;
}

export function getStickyTxOpen(): boolean {
  return stickyTxOpen;
}

export function getStickyTxMode(): StickyTxMode {
  return stickyTxMode;
}

export function setStickyTxOpen(next: boolean): void {
  stickyTxOpen = next;
}

export function setStickyTxMode(next: StickyTxMode): void {
  stickyTxMode = next;
}

/**
 * Tie sticky dialog state to the authenticated user. Switching users clears
 * open/mode so Buy/Add never remounts with another account's sticky flag.
 */
export function bindTransactionStickyUser(userId: string | null): void {
  if (stickyTxUserId === userId) return;
  // First claim in this JS realm (null → id) must NOT clear sticky open — that
  // is what survives TransactionCenter remount during holdings hydrate.
  // Only clear when switching between two different authenticated users (or logout).
  const switching =
    stickyTxUserId != null && userId != null && stickyTxUserId !== userId;
  const leaving = stickyTxUserId != null && userId == null;
  stickyTxUserId = userId;
  if (switching || leaving) {
    stickyTxOpen = false;
    stickyTxMode = "buy";
  }
}

export function __resetTransactionStickyForTests(): void {
  stickyTxOpen = false;
  stickyTxMode = "buy";
  stickyTxUserId = null;
}
