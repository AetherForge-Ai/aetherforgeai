/**
 * Buy/Add dialog snapshot lives outside the portfolio tree.
 *
 * Holdings live-price hydrate and cash/ledger soft-refresh re-render
 * PortfolioDashboard. If the dialog is a child of that tree it remounts and
 * Radix tears the open modal down mid ticker-search (~5.5s "Searching markets…"
 * then dismiss, no matches). Soft-refresh must not change mountId, must not
 * flip `open`, and must not replace the frozen holdings/cash the dialog opened
 * with.
 */

export type TxDialogMode = "buy" | "sell" | "deposit" | "withdraw";

export interface TxDialogSnapshot {
  /** Stable for the lifetime of an open dialog. Bumps only on account switch. */
  mountId: number;
  open: boolean;
  userId: string | null;
  mode: TxDialogMode;
  holdings: unknown[];
  cash: number;
  preferredAssetType: "stock" | "crypto" | "metal" | null;
}

type DoneHandler = (ledger: unknown) => void;
type OpenHandler = (open: boolean) => void;

let mountSeq = 1;
let snapshot: TxDialogSnapshot = {
  mountId: 1,
  open: false,
  userId: null,
  mode: "buy",
  holdings: [],
  cash: 0,
  preferredAssetType: null,
};

const listeners = new Set<() => void>();
let onDone: DoneHandler = () => {};
let onOpenChange: OpenHandler = () => {};

function emit() {
  for (const listener of listeners) listener();
}

export function subscribeTxDialog(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getTxDialogSnapshot(): TxDialogSnapshot {
  return snapshot;
}

export function setTxDialogHandlers(next: { onDone?: DoneHandler; onOpenChange?: OpenHandler }) {
  if (next.onDone) onDone = next.onDone;
  if (next.onOpenChange) onOpenChange = next.onOpenChange;
}

export function getTxDialogHandlers(): { onDone: DoneHandler; onOpenChange: OpenHandler } {
  return { onDone, onOpenChange };
}

export interface PublishTxDialogResult {
  mountId: number;
  /** True when holdings/cash churn was ignored because the dialog is open. */
  ignoredSoftRefresh: boolean;
}

/**
 * Publish dialog intent.
 * While open, a holdings/cash/mode republish (parent soft-refresh) is ignored
 * so React never sees new props and never remounts the dialog.
 */
export function publishTxDialog(
  next: Partial<Omit<TxDialogSnapshot, "mountId">> & { open?: boolean }
): PublishTxDialogResult {
  const closing = next.open === false;
  const opening = next.open === true;
  const userSwitch =
    next.userId != null && snapshot.userId != null && next.userId !== snapshot.userId;

  if (snapshot.open && userSwitch) {
    mountSeq += 1;
    snapshot = {
      ...snapshot,
      mountId: mountSeq,
      open: false,
      userId: next.userId ?? snapshot.userId,
      holdings: [],
      cash: 0,
      mode: "buy",
    };
    emit();
    return { mountId: snapshot.mountId, ignoredSoftRefresh: false };
  }

  // Already open: ignore holdings/cash republish (soft-refresh). A mode
  // change (Buy → Sell) is a user action and must apply without remounting.
  if (snapshot.open && !closing) {
    if (next.mode && next.mode !== snapshot.mode) {
      snapshot = { ...snapshot, mode: next.mode };
      emit();
      return { mountId: snapshot.mountId, ignoredSoftRefresh: false };
    }
    return { mountId: snapshot.mountId, ignoredSoftRefresh: true };
  }

  if (closing) {
    if (!snapshot.open) return { mountId: snapshot.mountId, ignoredSoftRefresh: false };
    snapshot = { ...snapshot, open: false };
    emit();
    return { mountId: snapshot.mountId, ignoredSoftRefresh: false };
  }

  if (opening) {
    snapshot = {
      mountId: snapshot.mountId,
      open: true,
      userId: next.userId ?? snapshot.userId,
      mode: next.mode ?? snapshot.mode,
      holdings: next.holdings ?? snapshot.holdings,
      cash: typeof next.cash === "number" ? next.cash : snapshot.cash,
      preferredAssetType:
        next.preferredAssetType !== undefined ? next.preferredAssetType : snapshot.preferredAssetType,
    };
    emit();
    return { mountId: snapshot.mountId, ignoredSoftRefresh: false };
  }

  // Closed: allow holdings/cash to track the dashboard. Same mount id.
  if (!snapshot.open) {
    const changed =
      (next.holdings && next.holdings !== snapshot.holdings) ||
      (typeof next.cash === "number" && next.cash !== snapshot.cash) ||
      (next.userId != null && next.userId !== snapshot.userId) ||
      (next.mode != null && next.mode !== snapshot.mode) ||
      (next.preferredAssetType !== undefined && next.preferredAssetType !== snapshot.preferredAssetType);
    if (!changed) return { mountId: snapshot.mountId, ignoredSoftRefresh: false };
    snapshot = {
      ...snapshot,
      userId: next.userId ?? snapshot.userId,
      mode: next.mode ?? snapshot.mode,
      holdings: next.holdings ?? snapshot.holdings,
      cash: typeof next.cash === "number" ? next.cash : snapshot.cash,
      preferredAssetType:
        next.preferredAssetType !== undefined ? next.preferredAssetType : snapshot.preferredAssetType,
    };
    emit();
  }
  return { mountId: snapshot.mountId, ignoredSoftRefresh: false };
}

/**
 * Portfolio/cash soft-refresh entry point. Never remounts or dismisses an
 * open Buy/Add dialog. Returns the post-condition the UI must keep.
 */
export function notePortfolioSoftRefresh(payload: { holdings?: unknown[]; cash?: number }): {
  mountId: number;
  open: boolean;
  remounted: boolean;
  dismissed: boolean;
  applied: boolean;
} {
  const beforeMount = snapshot.mountId;
  const beforeOpen = snapshot.open;
  const result = publishTxDialog({
    holdings: payload.holdings,
    cash: payload.cash,
  });
  return {
    mountId: snapshot.mountId,
    open: snapshot.open,
    remounted: snapshot.mountId !== beforeMount,
    dismissed: beforeOpen && !snapshot.open,
    applied: !result.ignoredSoftRefresh && !beforeOpen,
  };
}

/** Dashboard may commit holdings/cash state while the dialog is closed. */
export function shouldCommitPortfolioUpdate(): boolean {
  return !snapshot.open;
}

export function __resetTxDialogStoreForTests(): void {
  mountSeq = 1;
  snapshot = {
    mountId: 1,
    open: false,
    userId: null,
    mode: "buy",
    holdings: [],
    cash: 0,
    preferredAssetType: null,
  };
  onDone = () => {};
  onOpenChange = () => {};
  listeners.clear();
}
