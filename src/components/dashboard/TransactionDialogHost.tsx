"use client";

import { memo, useSyncExternalStore } from "react";
import { TransactionDialog } from "@/components/dashboard/TransactionCenter";
import type { Stock } from "@/lib/portfolio";
import {
  getTxDialogHandlers,
  getTxDialogSnapshot,
  subscribeTxDialog,
} from "@/lib/transaction-dialog-store";

type Sellable = Stock & { metalSourceId?: string };

/**
 * Buy/Add mounted beside the portfolio tree, not inside it.
 *
 * PortfolioDashboard re-renders when holdings, cash, or metals soft-refresh.
 * This host takes no props and is memoized, so those renders do not reach the
 * dialog. The store ignores holdings/cash republishes while open and keeps
 * mountId stable, so the dialog instance (and its ticker search) is not
 * remounted or dismissed.
 */
function TransactionDialogHostInner() {
  const snap = useSyncExternalStore(subscribeTxDialog, getTxDialogSnapshot, getTxDialogSnapshot);
  return (
    <TransactionDialog
      key={`${snap.userId ?? "none"}:${snap.mountId}`}
      open={snap.open}
      mode={snap.mode}
      holdings={snap.holdings as Sellable[]}
      cash={snap.cash}
      preferredAssetType={snap.preferredAssetType ?? undefined}
      onDone={(ledger) => getTxDialogHandlers().onDone(ledger)}
      onOpenChange={(next) => getTxDialogHandlers().onOpenChange(next)}
    />
  );
}

export const TransactionDialogHost = memo(TransactionDialogHostInner);
