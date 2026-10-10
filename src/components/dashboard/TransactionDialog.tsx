"use client";

import { useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  RecordTransactionPanel,
  bookHoldingFromStock,
} from "@/components/dashboard/RecordTransactionPanel";
import type { TxSeed } from "@/lib/transaction-dialog-store";
import type { RecordKind } from "@/lib/movement-preview";
import {
  guardDialogOpenChange,
  keepDialogOpenOnPortalInteraction,
  keepDialogOpenWhilePopoverOpen,
  type DialogCloseReason,
} from "@/lib/dialog-guards";
import type { Stock } from "@/lib/portfolio";

type Sellable = Stock & { metalSourceId?: string };

/**
 * The one Record a transaction dialog. Search stays inside the panel, and the
 * close guards keep a ticker lookup from dismissing it.
 */
export function TransactionDialog({
  open,
  onOpenChange,
  mode,
  holdings,
  cash,
  cashKnown = true,
  onDone,
  preferredAssetType,
  seed,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  mode: RecordKind;
  holdings: Sellable[];
  cash: number;
  cashKnown?: boolean;
  onDone: (ledger: unknown) => void;
  preferredAssetType?: "stock" | "crypto" | "metal" | null;
  seed?: TxSeed | null;
}) {
  const searchQueryRef = useRef("");
  const closeReasonRef = useRef<DialogCloseReason>("unknown");

  function requestExplicitClose() {
    closeReasonRef.current = "explicit";
    onOpenChange(false);
  }

  function handleDialogOpenChange(next: boolean) {
    const reason = closeReasonRef.current;
    closeReasonRef.current = "unknown";
    guardDialogOpenChange(next, onOpenChange, {
      reason,
      queryLength: searchQueryRef.current.trim().length,
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange} modal={false}>
      <DialogContent
        className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg"
        data-testid="record-transaction-dialog"
        onInteractOutside={(e) => {
          closeReasonRef.current = "interact-outside";
          e.preventDefault();
          keepDialogOpenOnPortalInteraction(e);
        }}
        onPointerDownOutside={(e) => {
          closeReasonRef.current = "pointer-outside";
          e.preventDefault();
          keepDialogOpenOnPortalInteraction(e);
        }}
        onFocusOutside={(e) => {
          closeReasonRef.current = "focus-outside";
          e.preventDefault();
          keepDialogOpenOnPortalInteraction(e);
        }}
        onEscapeKeyDown={(e) => {
          closeReasonRef.current = "escape";
          keepDialogOpenWhilePopoverOpen(e);
        }}
      >
        <DialogHeader className="shrink-0 space-y-1.5 px-4 pt-5 pr-14 sm:px-6 sm:pt-6">
          <DialogTitle className="font-display text-xl leading-snug">
            {mode === "correction" ? "Correct this holding" : "Record a transaction"}
          </DialogTitle>
          <DialogDescription>
            {mode === "correction"
              ? "Update the date, amount or price. Confirming writes a correction on the ledger. It does not overwrite the holding in silence."
              : "Shares, coins, DEX tokens, gold and silver, or a cash movement. One search, then review before anything is written."}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 sm:px-6">
          <RecordTransactionPanel
            open={open}
            initialMode={mode}
            holdings={holdings.map((holding) => bookHoldingFromStock(holding))}
            cash={cash}
            cashKnown={cashKnown}
            preferredAssetType={preferredAssetType}
            seed={seed}
            onQueryChange={(query) => {
              searchQueryRef.current = query;
            }}
            onDone={(ledger) => {
              onDone(ledger);
              requestExplicitClose();
            }}
            onRequestClose={requestExplicitClose}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
