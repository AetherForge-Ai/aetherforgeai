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
 * Single Buy/Add host for every dashboard subpage.
 *
 * Mounted from the root layout, not inside PortfolioDashboard. The stocks hub
 * (/dashboard/stocks) reconciles a large holdings table and extra dialogs when
 * live prices land; that used to remount this dialog during BAP search.
 * Transactions stayed open because its tree does not do that work. This host
 * takes no props and is memoized. The store ignores holdings/cash republishes
 * while open and keeps mountId stable.
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
