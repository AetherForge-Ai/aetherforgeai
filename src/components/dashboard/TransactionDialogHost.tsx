"use client";

import { memo, useEffect, useSyncExternalStore } from "react";
import { TransactionDialog } from "@/components/dashboard/TransactionDialog";
import type { Stock } from "@/lib/portfolio";
import { openRecordTransaction, type OpenRecordInput } from "@/lib/open-transaction";
import {
  getTxDialogHandlers,
  getTxDialogSnapshot,
  publishTxDialog,
  subscribeTxDialog,
} from "@/lib/transaction-dialog-store";

type Sellable = Stock & { metalSourceId?: string };

/**
 * Single Record a transaction host for every signed-in page.
 *
 * Mounted from the root layout, not inside PortfolioDashboard. The stocks hub
 * reconciles a large holdings table when live prices land; that used to remount
 * this dialog during search. The store ignores holdings/cash republishes while
 * open and keeps mountId stable.
 */
function TransactionDialogHostInner() {
  const snap = useSyncExternalStore(subscribeTxDialog, getTxDialogSnapshot, getTxDialogSnapshot);

  useEffect(() => {
    const onOpen = (event: Event) => {
      const detail = ((event as CustomEvent<OpenRecordInput>).detail || {}) as OpenRecordInput;
      openRecordTransaction(detail);
    };
    window.addEventListener("aetherforge:open-record", onOpen);
    return () => window.removeEventListener("aetherforge:open-record", onOpen);
  }, []);

  return (
    <TransactionDialog
      key={`${snap.userId ?? "none"}:${snap.mountId}`}
      open={snap.open}
      mode={snap.mode}
      holdings={snap.holdings as Sellable[]}
      cash={snap.cash}
      cashKnown={snap.cashKnown}
      preferredAssetType={snap.preferredAssetType}
      seed={snap.seed}
      onDone={(ledger) => getTxDialogHandlers().onDone(ledger)}
      onOpenChange={(next) => {
        getTxDialogHandlers().onOpenChange(next);
        if (!next && getTxDialogSnapshot().open) publishTxDialog({ open: false });
      }}
    />
  );
}

export const TransactionDialogHost = memo(TransactionDialogHostInner);
