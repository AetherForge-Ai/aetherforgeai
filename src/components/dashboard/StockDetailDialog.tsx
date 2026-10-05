"use client";

import { StockDetailView, type DetailTarget } from "@/components/dashboard/StockDetailView";

export type { DetailTarget };

/** Overlay kept for dashboard boards that are not the Markets explorer. */
export function StockDetailDialog({
  open,
  onOpenChange,
  target,
  canBuy = true,
  onBought,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  target: DetailTarget | null;
  canBuy?: boolean;
  onBought?: () => void;
}) {
  return (
    <StockDetailView
      variant="dialog"
      active={open}
      onOpenChange={onOpenChange}
      target={target}
      canBuy={canBuy}
      onBought={onBought}
    />
  );
}
