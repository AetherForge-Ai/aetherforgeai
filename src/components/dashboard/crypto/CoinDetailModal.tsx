"use client";

import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { CoinDetailView } from "@/components/dashboard/crypto/CoinDetailView";

export function CoinDetailModal({
  coinId,
  open,
  onOpenChange,
}: {
  coinId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92dvh] w-[96vw] max-w-4xl flex-col gap-0 overflow-hidden p-0">
        <CoinDetailView coinId={coinId} active={open} variant="dialog" />
      </DialogContent>
    </Dialog>
  );
}
