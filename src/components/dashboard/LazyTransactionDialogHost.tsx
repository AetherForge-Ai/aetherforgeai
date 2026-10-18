"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { openRecordTransaction, type OpenRecordInput } from "@/lib/open-transaction";
import { getTxDialogSnapshot, subscribeTxDialog } from "@/lib/transaction-dialog-store";

const TransactionDialogHost = dynamic(() => import("./TransactionDialogHost").then((mod) => mod.TransactionDialogHost), { ssr: false });

/**
 * Goal b18 M-1: the Buy/Add dialog (search, selects, the review screen) is about
 * 150 KB of JavaScript. Public pages load it only when someone opens it; signed-in
 * app pages load it at once so the first click is instant.
 */
export function LazyTransactionDialogHost() {
  const pathname = usePathname() || "";
  const snap = useSyncExternalStore(subscribeTxDialog, getTxDialogSnapshot, getTxDialogSnapshot);
  const [wanted, setWanted] = useState(false);
  const appPage = /^\/(dashboard|tax|settings|account)(\/|$)/.test(pathname);
  const mounted = appPage || wanted || snap.open;

  useEffect(() => {
    if (mounted) return;
    const onOpen = (event: Event) => {
      openRecordTransaction(((event as CustomEvent<OpenRecordInput>).detail || {}) as OpenRecordInput);
      setWanted(true);
    };
    window.addEventListener("aetherforge:open-record", onOpen);
    return () => window.removeEventListener("aetherforge:open-record", onOpen);
  }, [mounted]);

  return mounted ? <TransactionDialogHost /> : null;
}
