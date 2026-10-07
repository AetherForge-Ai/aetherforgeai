"use client";

import { publishTxDialog, type TxSeed } from "@/lib/transaction-dialog-store";
import { setStickyTxMode, setStickyTxOpen, type StickyTxMode } from "@/lib/transaction-sticky";

export interface OpenRecordInput {
  mode?: StickyTxMode;
  userId?: string | null;
  holdings?: unknown[];
  cash?: number;
  cashKnown?: boolean;
  preferredAssetType?: "stock" | "crypto" | "metal" | null;
  seed?: TxSeed | null;
}

/** Open the one Record a transaction panel from any signed-in page. */
export function openRecordTransaction(input: OpenRecordInput = {}): void {
  const mode = input.mode ?? "buy";
  setStickyTxMode(mode);
  setStickyTxOpen(true);
  publishTxDialog({
    open: true,
    mode,
    userId: input.userId ?? undefined,
    holdings: input.holdings,
    cash: input.cash,
    cashKnown: input.cashKnown,
    preferredAssetType: input.preferredAssetType ?? null,
    seed: input.seed ?? null,
  });
}
