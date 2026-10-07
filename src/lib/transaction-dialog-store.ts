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

export type TxDialogMode = "buy" | "sell" | "deposit" | "withdraw" | "dividend" | "tax";

/** Asset already chosen when Buy or Sell on a holding row opens the panel. */
export interface TxSeed {
  ticker: string;
  name: string;
  assetType: "stock" | "crypto" | "metal";
  coinId?: string;
  /** Live or last price, so the panel does not start blank. */
  price?: number | null;
  /** Dedicated metals-table id, when the row is not a ledger stock. */
  metalSourceId?: string;
}

export interface TxDialogSnapshot {
  /** Stable for the lifetime of an open dialog. Bumps only on account switch. */
  mountId: number;
  open: boolean;
  userId: string | null;
  mode: TxDialogMode;
  holdings: unknown[];
  cash: number;
  /**
   * False until the ledger has loaded. An open dialog may replace cash once
   * when this flips true, without remounting. A later soft-refresh is ignored.
   */
  cashKnown: boolean;
  preferredAssetType: "stock" | "crypto" | "metal" | null;
  seed: TxSeed | null;
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
  cashKnown: false,
  preferredAssetType: null,
  seed: null,
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
      cashKnown: false,
      mode: "buy",
      seed: null,
    };
    emit();
    return { mountId: snapshot.mountId, ignoredSoftRefresh: false };
  }

  // Already open: ignore holdings/cash republish (soft-refresh). A mode
  // change (Buy → Sell) is a user action and must apply without remounting.
  // The one exception is the first ledger settlement: cash opened at 0
  // before the book loaded must become the real balance without remounting.
  if (snapshot.open && !closing) {
    const settleCash =
      !snapshot.cashKnown && next.cashKnown === true && typeof next.cash === "number";
    if (settleCash || (next.mode && next.mode !== snapshot.mode)) {
      snapshot = {
        ...snapshot,
        mode: next.mode && next.mode !== snapshot.mode ? next.mode : snapshot.mode,
        cash: settleCash ? next.cash! : snapshot.cash,
        cashKnown: settleCash ? true : snapshot.cashKnown,
      };
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
      cashKnown: next.cashKnown === true,
      preferredAssetType:
        next.preferredAssetType !== undefined ? next.preferredAssetType : snapshot.preferredAssetType,
      seed: next.seed !== undefined ? next.seed : null,
    };
    emit();
    return { mountId: snapshot.mountId, ignoredSoftRefresh: false };
  }

  // Closed: allow holdings/cash to track the dashboard. Same mount id.
  if (!snapshot.open) {
    const changed =
      (next.holdings && next.holdings !== snapshot.holdings) ||
      (typeof next.cash === "number" && next.cash !== snapshot.cash) ||
      (next.cashKnown === true && !snapshot.cashKnown) ||
      (next.userId != null && next.userId !== snapshot.userId) ||
      (next.mode != null && next.mode !== snapshot.mode) ||
      (next.preferredAssetType !== undefined && next.preferredAssetType !== snapshot.preferredAssetType) ||
      (next.seed !== undefined && next.seed !== snapshot.seed);
    if (!changed) return { mountId: snapshot.mountId, ignoredSoftRefresh: false };
    snapshot = {
      ...snapshot,
      userId: next.userId ?? snapshot.userId,
      mode: next.mode ?? snapshot.mode,
      holdings: next.holdings ?? snapshot.holdings,
      cash: typeof next.cash === "number" ? next.cash : snapshot.cash,
      cashKnown: next.cashKnown === true ? true : snapshot.cashKnown,
      preferredAssetType:
        next.preferredAssetType !== undefined ? next.preferredAssetType : snapshot.preferredAssetType,
      seed: next.seed !== undefined ? next.seed : snapshot.seed,
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

/**
 * Whether a /api/stocks live-price body may be written into dashboard state.
 *
 * /dashboard/stocks used to apply the FIRST hydrate even while Buy/Add was
 * open (`holdingsHydratedRef` still false). That reconcile — holdings table,
 * price alerts, actionable signals — landed in the same ~5.5s window as
 * ticker search and dismissed Buy/Add on the stocks hub only. The transactions
 * page already deferred later overlays and stayed open. Every hydrate,
 * including the first, now waits until Buy/Add closes.
 */
export function holdingsHydrateAction(dialogOpen: boolean): "apply" | "defer" {
  return dialogOpen ? "defer" : "apply";
}

/** Dashboard may commit holdings/cash state while the dialog is closed. */
export function shouldCommitPortfolioUpdate(): boolean {
  return holdingsHydrateAction(snapshot.open) === "apply";
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
    cashKnown: false,
    preferredAssetType: null,
    seed: null,
  };
  onDone = () => {};
  onOpenChange = () => {};
  listeners.clear();
}
