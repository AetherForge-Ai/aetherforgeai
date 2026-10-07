"use client";

import { useEffect, useRef } from "react";
import { openRecordTransaction } from "@/lib/open-transaction";

export interface BuyTarget {
  ticker: string;
  name?: string;
  assetType?: "stock" | "crypto";
  price?: number;
}

/**
 * Existing Buy buttons on markets, coin and stock pages open the one
 * Record a transaction panel with that asset already filled in.
 */
export function BuyDialog({
  open,
  onOpenChange,
  target,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  target: BuyTarget | null;
  onDone?: () => void;
}) {
  const wasOpen = useRef(false);
  useEffect(() => {
    const justOpened = open && !wasOpen.current;
    wasOpen.current = open;
    if (!justOpened || !target?.ticker) return;
    const assetType = target.assetType === "crypto" ? "crypto" : "stock";
    openRecordTransaction({
      mode: "buy",
      preferredAssetType: assetType,
      seed: {
        ticker: target.ticker,
        name: target.name || target.ticker,
        assetType,
        price: target.price,
      },
    });
    onOpenChange(false);
  }, [open, target, onOpenChange]);
  return null;
}
