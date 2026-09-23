/**
 * Client-only portfolio/session caches that must never leak across authenticated users.
 *
 * Unscoped sessionStorage (`af.cashBalanceNZD`) and module sticky Buy/Add state
 * survived logout→login in the same tab; opening Buy/Add could show another
 * account's cash. Everything here is namespaced by userId and cleared on
 * user change / logout.
 */

import { releaseDialogSearchGuard, __resetDialogGuardsForTests } from "@/lib/dialog-guards";
import {
  bindTransactionStickyUser,
  __resetTransactionStickyForTests,
} from "@/lib/transaction-sticky";

const LEGACY_CASH_KEY = "af.cashBalanceNZD";
const CASH_KEY_PREFIX = "af.cashBalanceNZD.";

/** Module-level last bound user — detects SPA login switches without full reload. */
let boundUserId: string | null | undefined = undefined;

export function cashBalanceStorageKey(userId: string): string {
  return CASH_KEY_PREFIX + userId;
}

/** Drop legacy unscoped cash key so it cannot poison a different account. */
export function purgeLegacyCashCache(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(LEGACY_CASH_KEY);
  } catch {
    /* ignore */
  }
}

export function readCachedCashNZD(userId: string | null | undefined): number | null {
  if (!userId || typeof window === "undefined") return null;
  purgeLegacyCashCache();
  try {
    const raw = sessionStorage.getItem(cashBalanceStorageKey(userId));
    if (raw == null) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : null;
  } catch {
    return null;
  }
}

export function writeCachedCashNZD(userId: string | null | undefined, bal: number): void {
  if (!userId || typeof window === "undefined") return;
  if (!Number.isFinite(bal) || bal < 0) return;
  purgeLegacyCashCache();
  try {
    sessionStorage.setItem(cashBalanceStorageKey(userId), String(bal));
  } catch {
    /* ignore */
  }
}

/** Remove all af.cashBalanceNZD* keys (scoped + legacy). */
export function clearAllCachedCashNZD(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(LEGACY_CASH_KEY);
    const keys: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith(CASH_KEY_PREFIX)) keys.push(k);
    }
    for (const k of keys) sessionStorage.removeItem(k);
  } catch {
    /* ignore */
  }
}

/**
 * Bind module sticky dialog state + caches to the active userId.
 * When userId changes, sticky Buy/Add and dialog search guards are cleared.
 */
export function bindClientUser(userId: string | null): void {
  if (typeof window === "undefined") return;
  const prev = boundUserId;
  if (prev === userId) {
    bindTransactionStickyUser(userId);
    return;
  }
  boundUserId = userId;
  purgeLegacyCashCache();
  releaseDialogSearchGuard();
  __resetDialogGuardsForTests();
  if (prev !== undefined && prev !== null && prev !== userId) {
    __resetTransactionStickyForTests();
  }
  bindTransactionStickyUser(userId);
}

/** Full client wipe on logout. */
export function clearClientUserState(): void {
  boundUserId = null;
  clearAllCachedCashNZD();
  releaseDialogSearchGuard();
  __resetDialogGuardsForTests();
  __resetTransactionStickyForTests();
}

/** Test helper. */
export function __resetClientUserStateForTests(): void {
  boundUserId = undefined;
}
